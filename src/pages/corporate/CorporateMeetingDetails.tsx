import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckSquare,
  MessageSquare,
  ExternalLink,
  Bot,
  Square,
  Loader2,
  Clock,
  UserCircle,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import {
  getMeetingDetail,
  startMeeting,
  stopMeeting,
  generateMeetingSummary,
  deleteMeeting,
  type MeetingBotDetail,
} from "@/lib/api";
import LiveMeetingTranscript from "@/components/meeting/LiveMeetingTranscript";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CorporateMeetingDetailsProps {
  role: "manager" | "member";
}

const CorporateMeetingDetails = ({ role }: CorporateMeetingDetailsProps) => {
  const { workspaceId, meetingId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [apiDetail, setApiDetail] = useState<MeetingBotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const basePath =
    role === "manager"
      ? `/business/manager/workspaces/${workspaceId}`
      : `/business/member/workspaces/${workspaceId}`;

  const loadDetail = () => {
    if (!meetingId || !token) return;
    getMeetingDetail(token, meetingId)
      .then(setApiDetail)
      .catch(() => setApiDetail(null));
  };

  useEffect(() => {
    if (!meetingId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getMeetingDetail(token, meetingId)
      .then(setApiDetail)
      .catch(() => setApiDetail(null))
      .finally(() => setLoading(false));
  }, [meetingId, token]);

  // When just opened with status "scheduled", poll a few times so we pick up "live" as soon as the meeting starts
  useEffect(() => {
    if (!apiDetail || apiDetail.meeting.status !== "scheduled" || !meetingId || !token) return;
    const t1 = setTimeout(loadDetail, 1500);
    const t2 = setTimeout(loadDetail, 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [apiDetail?.meeting.status, meetingId, token]);

  // Poll when live to refresh attendance/status
  useEffect(() => {
    if (!apiDetail || apiDetail.meeting.status !== "live" || !meetingId || !token) return;
    const interval = setInterval(loadDetail, 15000);
    return () => clearInterval(interval);
  }, [apiDetail?.meeting.status, meetingId, token]);

  const handleStartBot = async () => {
    if (!token || !meetingId || !apiDetail?.meeting.meeting_url) return;
    setStarting(true);
    try {
      await startMeeting(token, meetingId, {
        meeting_url: apiDetail.meeting.meeting_url,
        project_id: apiDetail.meeting.project_id,
        title: apiDetail.meeting.title,
      });
      loadDetail();
    } finally {
      setStarting(false);
    }
  };

  const handleStopMeeting = async () => {
    if (!token || !meetingId) return;
    setStopping(true);
    try {
      await stopMeeting(token, meetingId);
      loadDetail();
    } finally {
      setStopping(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!token || !meetingId) return;
    setGeneratingSummary(true);
    try {
      await generateMeetingSummary(token, meetingId);
      loadDetail();
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!token || !meetingId) return;
    setDeleting(true);
    try {
      await deleteMeeting(token, meetingId);
      setDeleteDialogOpen(false);
      navigate(`${basePath}/meetings`);
    } finally {
      setDeleting(false);
    }
  };

  const toPercent = (value?: number) =>
    `${Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100)}%`;

  // API-driven bot meeting UI (Vyimayi-style tabs)
  if (!loading && apiDetail) {
    const {
      meeting,
      transcript_segments,
      attendance,
      summary,
      action_items,
      total_participants = 0,
      total_duration,
    } = apiDetail;
    const isLive = meeting.status === "live";
    const isScheduled = meeting.status === "scheduled";
    const isEnded = meeting.status === "ended";
    const fullTranscriptText =
      (transcript_segments ?? [])
        .map((s) => s.text)
        .filter(Boolean)
        .join(" ") || "";

    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/meetings`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to meetings
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {meeting.meeting_url && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(meeting.meeting_url!, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Join meeting
              </Button>
            )}
            {isScheduled && meeting.meeting_url && (
              <Button size="sm" disabled={starting} onClick={handleStartBot}>
                {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                Start bot
              </Button>
            )}
            {isLive && (
              <Button variant="destructive" size="sm" disabled={stopping} onClick={handleStopMeeting}>
                {stopping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                Stop meeting
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete meeting
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete meeting?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this meeting and all its data (transcript, attendance, summary, action items). This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteMeeting();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Title and status */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{meeting.title || "Meeting"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={isLive ? "default" : "secondary"} className="capitalize">
              {meeting.status}
            </Badge>
            {meeting.started_at && (
              <span>Started {format(new Date(meeting.started_at), "MMM d, h:mm a")}</span>
            )}
            {meeting.ended_at && (
              <span>Ended {format(new Date(meeting.ended_at), "MMM d, h:mm a")}</span>
            )}
          </div>
        </div>

        {/* Stats cards (Overview-style) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <UserCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Participants</span>
              </div>
              <p className="mt-1 text-2xl font-semibold">{total_participants}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Duration</span>
              </div>
              <p className="mt-1 text-2xl font-semibold">
                {total_duration != null ? `${Math.floor(total_duration / 60)}m` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs font-medium">Segments</span>
              </div>
              <p className="mt-1 text-2xl font-semibold">{transcript_segments?.length ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckSquare className="h-4 w-4" />
                <span className="text-xs font-medium">Actions</span>
              </div>
              <p className="mt-1 text-2xl font-semibold">{action_items?.length ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Overview, Transcripts, Attendance, Summary, Actions */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transcripts">Transcripts</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Meeting info</CardTitle>
                <CardDescription>Platform, status, and timing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium text-muted-foreground">Status:</span> <span className="capitalize">{meeting.status}</span></p>
                {meeting.meeting_url && (
                  <p>
                    <span className="font-medium text-muted-foreground">Link:</span>{" "}
                    <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {meeting.meeting_url}
                    </a>
                  </p>
                )}
                {meeting.started_at && (
                  <p><span className="font-medium text-muted-foreground">Started:</span> {format(new Date(meeting.started_at), "PPpp")}</p>
                )}
                {meeting.ended_at && (
                  <p><span className="font-medium text-muted-foreground">Ended:</span> {format(new Date(meeting.ended_at), "PPpp")}</p>
                )}
                {summary?.meeting_signals && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Meeting insights</p>
                    <p>
                      <span className="font-medium text-muted-foreground">Confidence:</span>{" "}
                      {toPercent(summary.meeting_signals.confidence_score)}
                    </p>
                    <p>
                      <span className="font-medium text-muted-foreground">Toxicity:</span>{" "}
                      {toPercent(summary.meeting_signals.toxicity_score)}
                    </p>
                    <p>
                      <span className="font-medium text-muted-foreground">Emotion:</span>{" "}
                      <span className="capitalize">
                        {summary.meeting_signals.dominant_emotion || "neutral"}
                      </span>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcripts" className="mt-4">
            <div className="space-y-4">
              {isLive && meetingId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      Live transcript
                    </CardTitle>
                    <CardDescription>Real-time transcription. Join the meeting and speak to see text here.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LiveMeetingTranscript meetingId={meetingId} />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Full transcript</CardTitle>
                  <CardDescription>Saved segments from the meeting bot</CardDescription>
                </CardHeader>
                <CardContent>
                  {fullTranscriptText ? (
                    <div className="max-h-[400px] overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                      {fullTranscriptText}
                    </div>
                  ) : (transcript_segments?.length ?? 0) > 0 ? (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {transcript_segments!.map((s, i) => (
                        <p key={i} className="text-sm">
                          {s.text}
                          {s.timestamp && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {format(new Date(s.timestamp), "h:mm")}
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {isLive ? "Transcript will appear as the bot transcribes." : "No transcript yet."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attendance</CardTitle>
                <CardDescription>Participants reported by the bot (join/leave)</CardDescription>
              </CardHeader>
              <CardContent>
                {attendance && attendance.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2 text-left font-medium">Participant</th>
                          <th className="px-4 py-2 text-left font-medium">Join</th>
                          <th className="px-4 py-2 text-left font-medium">Leave</th>
                          <th className="px-4 py-2 text-left font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.map((a, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-4 py-2 font-medium">{a.participant_name}</td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {a.join_time ? format(new Date(a.join_time), "PPpp") : "—"}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {a.leave_time ? format(new Date(a.leave_time), "PPpp") : "In meeting"}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {a.duration_seconds != null ? `${Math.round(a.duration_seconds)}s` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No attendance data yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
                <CardDescription>Overview and key points (generated when meeting ends)</CardDescription>
              </CardHeader>
              <CardContent>
                {summary?.summary_text ? (
                  <div className="space-y-4">
                    <p className="text-sm leading-relaxed">{summary.summary_text}</p>
                    {summary.key_points && summary.key_points.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Key points</p>
                        <ul className="text-sm list-disc list-inside space-y-1 text-muted-foreground">
                          {summary.key_points.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground italic">
                      {isLive ? "Summary will be generated when you stop the meeting." : "No summary yet."}
                    </p>
                    {isEnded && (
                      <Button variant="outline" size="sm" disabled={generatingSummary} onClick={handleGenerateSummary}>
                        {generatingSummary ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Generate summary
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Action items</CardTitle>
                <CardDescription>Tasks extracted from the meeting (after stop)</CardDescription>
              </CardHeader>
              <CardContent>
                {action_items && action_items.length > 0 ? (
                  <div className="space-y-2">
                    {action_items.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                      >
                        <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{typeof a === "string" ? a : a.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {isLive ? "Action items will be extracted when you stop the meeting." : "No action items yet."}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="p-8">
      <Button variant="ghost" onClick={() => navigate(basePath + "/meetings")}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>
      <p className="mt-4 text-muted-foreground">Meeting not found.</p>
    </div>
  );
};

export default CorporateMeetingDetails;
