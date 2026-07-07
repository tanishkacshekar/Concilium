from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, tasks, recordings, meeting_bot_ws, meetings_bot

from app.bot.bot_manager import bot_manager

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(recordings.router, prefix="/recordings", tags=["recordings"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(meeting_bot_ws.router, prefix="/ws", tags=["meeting-bot-ws"])
api_router.include_router(meetings_bot.router, prefix="/meetings", tags=["meetings"])

# Wire bot manager into meeting routes (start/stop)
meetings_bot.set_bot_manager(bot_manager)
