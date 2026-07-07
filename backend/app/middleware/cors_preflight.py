"""
Handle CORS preflight (OPTIONS) requests first so they always return 200.
Fixes browsers getting 400 on OPTIONS before POST.
Uses raw ASGI so it runs before any other processing.
"""


class CORSPreflightMiddleware:
    def __init__(self, app, allow_origins: list):
        self.app = app
        self.allow_origins = list(allow_origins) if allow_origins else ["http://localhost:5173", "http://127.0.0.1:5173"]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] != "OPTIONS":
            await self.app(scope, receive, send)
            return
        origin = next((v for k, v in scope.get("headers", []) if k == b"origin"), b"").decode("utf-8") or ""
        # Allow request origin if in list, or any localhost/127.0.0.1 (e.g. frontend :8080, backend :8001)
        if origin and (origin in self.allow_origins or origin.startswith(("http://localhost:", "http://127.0.0.1:"))):
            allow_origin = origin
        else:
            allow_origin = self.allow_origins[0] if self.allow_origins else (origin or "http://localhost:8080")
        headers = [
            (b"access-control-allow-origin", allow_origin.encode()),
            (b"access-control-allow-methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
            (b"access-control-allow-headers", b"*"),
            (b"access-control-allow-credentials", b"true"),
            (b"access-control-max-age", b"86400"),
        ]
        await send({"type": "http.response.start", "status": 200, "headers": headers})
        await send({"type": "http.response.body", "body": b""})
