import { useEffect, useState, useRef } from "react";
import { getWsBaseUrl } from "@/lib/api";

interface LiveMeetingTranscriptProps {
  meetingId: string;
  className?: string;
}

/**
 * Connects to /api/v1/ws/meeting/{meetingId}/live and displays live transcript lines.
 */
export default function LiveMeetingTranscript({ meetingId, className = "" }: LiveMeetingTranscriptProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    const base = getWsBaseUrl();
    const url = `${base}/api/v1/ws/meeting/${meetingId}/live`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript" && data.text) {
          setLines((prev) => [...prev, data.text]);
        }
      } catch {
        // ignore
      }
    };
    ws.onerror = () => setConnected(false);
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [meetingId]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <span className={connected ? "text-green-600" : "text-muted-foreground"}>
          {connected ? "● Live" : "○ Disconnected"}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto rounded border bg-muted/30 p-3 text-sm space-y-1">
        {lines.length === 0 && !connected && <p className="text-muted-foreground italic">Connecting…</p>}
        {lines.length === 0 && connected && <p className="text-muted-foreground italic">Waiting for transcript…</p>}
        {lines.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
}
