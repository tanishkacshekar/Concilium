from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.api.v1.router import api_router
from app.middleware.cors_preflight import CORSPreflightMiddleware

app = FastAPI(
    title="Meeting Monitor API",
    description="Backend API for Meeting Monitor application",
    version="1.0.0",
)

# Ensure CORS origins is always a list; include common dev origins (8080, 5173, 3000)
_default_origins = [
    "http://localhost:5173", "http://localhost:3000", "http://localhost:8080",
    "http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://127.0.0.1:8080",
]
_cors_origins = list(settings.CORS_ORIGINS) if settings.CORS_ORIGINS else _default_origins.copy()
for origin in _default_origins:
    if origin not in _cors_origins:
        _cors_origins.append(origin)

# CORS for actual GET/POST etc (this runs second = inner)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)
# OPTIONS preflight - allow any localhost/127.0.0.1 origin
app.add_middleware(CORSPreflightMiddleware, allow_origins=_cors_origins)

# Include routers
app.include_router(api_router, prefix="/api/v1")

@app.on_event("startup")
async def startup_event():
    """Initialize database connection on startup."""
    # Validate Groq key by calling the API (so we know if key is rejected by Groq)
    if settings.GROQ_API_KEY and len(settings.GROQ_API_KEY) > 10:
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            list(client.models.list())  # minimal call to validate key
            print("✅ GROQ_API_KEY valid (transcription enabled)")
        except Exception as e:
            err = str(e).lower()
            if "401" in err or "invalid" in err or "auth" in err:
                print("❌ GROQ_API_KEY rejected by Groq. Create a new key at https://console.groq.com and replace GROQ_API_KEY in backend/.env")
            else:
                print("⚠️ GROQ check failed:", e)
    else:
        print("⚠️ GROQ_API_KEY missing in backend/.env — live transcription disabled. Get a key at https://console.groq.com")
    await init_db()

@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown"""
    from app.core.database import close_db
    await close_db()

@app.get("/")
async def root():
    return {"message": "Meeting Monitor API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
