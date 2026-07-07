"""
Development server runner. Load .env from backend dir first so GROQ_API_KEY is set before config loads.
"""
from pathlib import Path

# Load backend/.env before any app imports (so uvicorn reload and workers see it)
_backend_dir = Path(__file__).resolve().parent
_env_file = _backend_dir / ".env"
if _env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=True)

import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
