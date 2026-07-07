"""Model for uploaded meeting recordings with transcription, summary, and action items."""
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class RecordingSummary(BaseModel):
    overview: str = ""
    key_points: List[str] = []
    decisions: List[str] = []


class MeetingRecordingBase(BaseModel):
    project_id: str
    title: str = ""


class MeetingRecordingCreate(MeetingRecordingBase):
    pass


class MeetingRecording(MeetingRecordingBase):
    id: str
    user_id: str
    file_name: str
    status: str  # "processing" | "completed" | "failed"
    transcription: Optional[str] = None
    summary: Optional[RecordingSummary] = None
    summary_dict: Optional[dict] = None  # raw dict for API response
    action_items: List[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
