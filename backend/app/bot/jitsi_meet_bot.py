"""
Jitsi Meet bot: Selenium + Chrome opens meeting URL, injects participant JS, streams system audio to backend.
"""
import asyncio
import json
import threading
from typing import List, Tuple

from app.audio.system_audio_capture import SystemAudioCapture
from app.core.config import settings
from app.bot.base_bot import BaseBot

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

# Optional: webdriver_manager for ChromeDriver
try:
    from webdriver_manager.chrome import ChromeDriverManager
    from selenium.webdriver.chrome.service import Service
    HAS_WDM = True
except ImportError:
    HAS_WDM = False


class JitsiMeetBot(BaseBot):
    """Join Jitsi via Selenium; inject join/leave API calls; stream system audio to WebSocket."""

    def __init__(self, meeting_id: str, backend_url: str = None):
        self.meeting_id = meeting_id
        self.backend_url = (backend_url or settings.BACKEND_URL).rstrip("/")
        self._driver = None
        self._capture: SystemAudioCapture = None
        self._running = False

    async def join_meeting(self, meeting_url: str) -> bool:
        if not SELENIUM_AVAILABLE:
            raise RuntimeError("selenium is not installed. pip install selenium webdriver-manager")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._join_sync, meeting_url)

    def _join_sync(self, meeting_url: str) -> bool:
        opts = Options()
        opts.add_argument("--use-fake-ui-for-media-stream")
        opts.add_argument("--autoplay-policy=no-user-gesture-required")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
        if HAS_WDM:
            service = Service(ChromeDriverManager().install())
            self._driver = webdriver.Chrome(service=service, options=opts)
        else:
            self._driver = webdriver.Chrome(options=opts)
        self._driver.get(meeting_url)
        # Click "Join" or similar (Jitsi welcome page)
        try:
            wait = WebDriverWait(self._driver, 15)
            join_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='prejoin.joinMeeting']")))
            join_btn.click()
        except Exception:
            try:
                join_btn = self._driver.find_element(By.XPATH, "//*[contains(text(),'Join')]")
                join_btn.click()
            except Exception:
                pass
        # Inject JS to call backend on participant join/leave
        api_base = self.backend_url + "/api/v1/meetings/" + self.meeting_id
        inject = f"""
        (function() {{
            var meetingId = "{self.meeting_id}";
            var joinUrl = "{api_base}/participants/join";
            var leaveUrl = "{api_base}/participants/leave";
            function post(url, body) {{
                fetch(url, {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify(body) }}).catch(function() {{}});
            }}
            if (window.APP && window.APP.conference && window.APP.conference._room) {{
                var room = window.APP.conference._room;
                room.on('participantJoined', function(p) {{
                    var id = p.getId ? p.getId() : p.id;
                    var name = (p.getDisplayName && p.getDisplayName()) || (p.displayName || 'Participant');
                    post(joinUrl, {{ participant_id: id, name: name }});
                }});
                room.on('participantLeft', function(p) {{
                    var id = p.getId ? p.getId() : p.id;
                    post(leaveUrl, {{ participant_id: id }});
                }});
            }}
        }})();
        """
        try:
            self._driver.execute_script(inject)
        except Exception:
            pass
        return True

    async def start_audio_stream(self, callback_url: str) -> None:
        """Run capture in thread; in async loop send chunks over WebSocket.
        Uses AUDIO_INPUT_DEVICE when set (e.g. 'Stereo Mix') so bot captures system audio
        for Groq transcription instead of the microphone."""
        import logging
        import websockets
        log = logging.getLogger(__name__)
        device = getattr(settings, "AUDIO_INPUT_DEVICE", None)
        self._capture = SystemAudioCapture(device=device)
        try:
            self._capture.start()
        except Exception as e:
            log.exception("Audio capture start failed: %s", e)
            raise RuntimeError(f"Audio capture start failed: {e}") from e
        self._running = True
        # Continuous non-blocking loop: reconnect on failures, keep sending audio frames.
        while self._running:
            try:
                async with websockets.connect(callback_url) as ws:
                    log.info("Bot connected to audio callback %s", callback_url)
                    chunk_count = 0
                    while self._running:
                        try:
                            # Small timeout so we can detect stalled capture and keep WS alive.
                            chunk = await asyncio.wait_for(self._capture.get_audio_chunk(), timeout=5.0)
                        except asyncio.TimeoutError:
                            # Heartbeat to keep connection open even if capture is briefly silent.
                            await ws.send(b"")
                            continue
                        if chunk:
                            await ws.send(chunk)
                            chunk_count += 1
                            if chunk_count == 1:
                                log.debug("First audio chunk sent for meeting %s", self.meeting_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.warning("Audio WebSocket disconnected, reconnecting in 2s: %s", e)
                await asyncio.sleep(2)

    def get_participants(self) -> List[Tuple[str, str]]:
        if not self._driver:
            return []
        try:
            result = self._driver.execute_script("""
                if (window.APP && window.APP.conference && window.APP.conference._room) {
                    var room = window.APP.conference._room;
                    var list = room.getParticipants ? room.getParticipants() : [];
                    return list.map(function(p) {
                        return [p.getId ? p.getId() : p.id, (p.getDisplayName && p.getDisplayName()) || p.displayName || 'Participant'];
                    });
                }
                return [];
            """)
            return result or []
        except Exception:
            return []

    async def leave_meeting(self) -> None:
        self._running = False
        if self._capture:
            self._capture.stop()
            self._capture = None
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None
