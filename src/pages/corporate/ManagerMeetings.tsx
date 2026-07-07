import { 
  LayoutDashboard, 
  Calendar, 
  ListTodo, 
  LayoutGrid, 
  Users, 
  BarChart3, 
  Settings,
  Plus,
  Video,
  Clock,
  CheckCircle2,
  Play,
  Square,
  Upload,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileAudio,
  ExternalLink,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import UploadMeeting from '@/components/meetings/UploadMeeting';
import { format, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

function safeFormat(dateInput: string | Date | null | undefined, fmt: string, fallback = '—'): string {
  if (dateInput == null) return fallback;
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return Number.isNaN(d.getTime()) ? fallback : format(d, fmt);
}
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  listMeetingRecordings,
  createMeeting,
  startMeeting,
  stopMeeting,
  listMeetings,
  type MeetingRecordingApi,
  type MeetingBotListItem,
} from '@/lib/api';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function RecordingHistoryItem({ recording }: { recording: MeetingRecordingApi }) {
  const [open, setOpen] = useState(false);
  const summary = recording.summary ?? recording.summary_dict;
  const created = safeFormat(recording.created_at, 'MMM d, yyyy • h:mm a', '');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors",
              open && "bg-muted/30"
            )}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileAudio className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{recording.title || recording.file_name}</p>
              <p className="text-sm text-muted-foreground">{created}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="secondary" className="text-xs">
                {recording.action_items?.length ?? 0} actions
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">
                {recording.status}
              </Badge>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t bg-muted/20 p-4 space-y-4">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4" />
                Transcription
              </h4>
              <div className="max-h-48 overflow-y-auto rounded-md bg-background p-3 text-sm whitespace-pre-wrap text-muted-foreground">
                {recording.transcription || 'No transcription available.'}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" />
                Summary
              </h4>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{summary?.overview ?? 'No summary.'}</p>
                {(summary?.key_points?.length ?? 0) > 0 && (
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    {summary!.key_points!.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                {(summary?.decisions?.length ?? 0) > 0 && (
                  <div>
                    <span className="font-medium">Decisions: </span>
                    <span className="text-muted-foreground">{summary!.decisions!.join('; ')}</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <ListTodo className="h-4 w-4" />
                Action Items
              </h4>
              <ul className="space-y-1.5">
                {(recording.action_items?.length ?? 0) > 0 ? (
                  recording.action_items!.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">None</li>
                )}
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

const ManagerMeetings = () => {
  const { workspaceId = "alpha" } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const basePath = `/business/manager/workspaces/${workspaceId}`;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [recordings, setRecordings] = useState<MeetingRecordingApi[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [botMeetings, setBotMeetings] = useState<MeetingBotListItem[]>([]);
  const [botMeetingsLoading, setBotMeetingsLoading] = useState(false);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createUrl, setCreateUrl] = useState('');
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'ended'>('all');

  const fetchBotMeetings = useCallback(async () => {
    if (!token || !workspaceId) return;
    setBotMeetingsLoading(true);
    try {
      const { meetings: list } = await listMeetings(token, workspaceId);
      setBotMeetings(list);
    } catch {
      setBotMeetings([]);
    } finally {
      setBotMeetingsLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchBotMeetings();
  }, [fetchBotMeetings]);

  const handleCreateMeeting = async () => {
    if (!token || !createUrl.trim()) {
      setCreateError('Meeting URL is required.');
      return;
    }
    const url = createUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setCreateError('URL must start with http:// or https://');
      return;
    }
    setCreateError('');
    setCreateSubmitting(true);
    try {
      const { id } = await createMeeting(token, {
        project_id: workspaceId,
        title: createTitle.trim() || 'Meeting',
        meeting_url: url,
      });
      setCreateMeetingOpen(false);
      setCreateTitle('');
      setCreateUrl('');
      navigate(`${basePath}/meeting/${id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create meeting');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleStartBot = async (m: MeetingBotListItem) => {
    if (!token || !m.meeting_url) return;
    setStartingId(m.id);
    try {
      await startMeeting(token, m.id, {
        meeting_url: m.meeting_url,
        project_id: workspaceId,
        title: m.title || 'Meeting',
      });
      await fetchBotMeetings();
      navigate(`${basePath}/meeting/${m.id}`);
    } catch {
      await fetchBotMeetings();
    } finally {
      setStartingId(null);
    }
  };

  const handleStopBot = async (m: MeetingBotListItem) => {
    if (!token) return;
    setStoppingId(m.id);
    try {
      await stopMeeting(token, m.id);
      await fetchBotMeetings();
    } finally {
      setStoppingId(null);
    }
  };

  const fetchRecordings = useCallback(async () => {
    if (!token) return;
    setRecordingsLoading(true);
    try {
      const list = await listMeetingRecordings(token, workspaceId);
      setRecordings(list);
    } catch {
      setRecordings([]);
    } finally {
      setRecordingsLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const scheduledMeetings = useMemo(
    () => botMeetings.filter((m) => m.status === 'scheduled'),
    [botMeetings],
  );
  const liveMeetings = useMemo(
    () => botMeetings.filter((m) => m.status === 'live'),
    [botMeetings],
  );
  const completedMeetings = useMemo(
    () => botMeetings.filter((m) => m.status === 'ended'),
    [botMeetings],
  );
  const allMeetingsForHistory = useMemo(
    () =>
      [...botMeetings].sort((a, b) => {
        const aTime = a.ended_at || a.started_at || '';
        const bTime = b.ended_at || b.started_at || '';
        return bTime.localeCompare(aTime);
      }),
    [botMeetings],
  );
  const allCalendarMeetings = useMemo(
    () => botMeetings.filter((m) => m.started_at || m.status === 'scheduled'),
    [botMeetings],
  );
  const meetingsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return allCalendarMeetings.filter((m) => m.started_at && isSameDay(new Date(m.started_at), selectedDate));
  }, [allCalendarMeetings, selectedDate]);

  // Poll meetings list when there is a live meeting so Meeting History shows updated status
  useEffect(() => {
    if (!token || !workspaceId || liveMeetings.length === 0) return;
    const interval = setInterval(fetchBotMeetings, 10000);
    return () => clearInterval(interval);
  }, [token, workspaceId, liveMeetings.length, fetchBotMeetings]);

  const managerSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar, badge: scheduledMeetings.length },
    { title: 'Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: 5 },
    { title: 'Kanban Board', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Team', href: `${basePath}/team`, icon: Users },
    { title: 'Analytics', href: `${basePath}/analytics`, icon: BarChart3, isPremium: true },
    { title: 'Settings', href: `${basePath}/settings`, icon: Settings },
  ];
  return (
    <DashboardLayout
      sidebarItems={managerSidebarItems}
      sidebarTitle="Manager"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold">Meetings</h1>
          <p className="text-muted-foreground">
            Create or start meetings with the transcription bot, or upload recordings for AI analysis
          </p>
        </div>

        {/* Live meeting bot: list + create + start */}
        <Card className="shadow-card border-primary/20">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-primary" />
                  Meetings with transcription bot
                </CardTitle>
                <CardDescription className="mt-1">
                  Create a meeting, start the bot to join and transcribe in real time. Open a meeting to see live transcript, attendance, summary and action items after you stop.
                </CardDescription>
              </div>
              <Dialog open={createMeetingOpen} onOpenChange={(o) => { setCreateMeetingOpen(o); setCreateError(''); }}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create meeting
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create meeting</DialogTitle>
                    <DialogDescription>
                      Add a meeting (e.g. Jitsi link). You can start the bot from the meeting detail page.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Label htmlFor="create-title">Title (optional)</Label>
                    <Input
                      id="create-title"
                      placeholder="Weekly standup"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                    />
                    <Label htmlFor="create-url">Meeting URL *</Label>
                    <Input
                      id="create-url"
                      placeholder="https://meet.jit.si/YourRoom"
                      value={createUrl}
                      onChange={(e) => { setCreateUrl(e.target.value); setCreateError(''); }}
                    />
                    {createError && <p className="text-sm text-destructive">{createError}</p>}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateMeetingOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateMeeting} disabled={createSubmitting}>
                      {createSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {botMeetings.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Filter:</span>
                {(['all', 'scheduled', 'live', 'ended'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={statusFilter === f ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>
            )}
            {botMeetingsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : botMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No meetings yet. Create one or start a live meeting above.</p>
            ) : (
              <div className="space-y-2">
                {botMeetings
                  .filter((m) => statusFilter === 'all' || m.status === statusFilter)
                  .map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{m.title || 'Meeting'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.status}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {m.status === 'scheduled' && m.meeting_url && (
                        <Button
                          size="sm"
                          onClick={() => handleStartBot(m)}
                          disabled={!!startingId}
                        >
                          {startingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                          Start bot
                        </Button>
                      )}
                      {m.status === 'live' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleStopBot(m)}
                          disabled={!!stoppingId}
                        >
                          {stoppingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 mr-1" />}
                          Stop
                        </Button>
                      )}
                      {m.meeting_url && (
                        <Button size="sm" variant="ghost" onClick={() => window.open(m.meeting_url!, '_blank')}>
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Join
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => navigate(`${basePath}/meeting/${m.id}`)}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <UploadMeeting
            variant="corporate"
            title="Upload Meeting Recording"
            projectId={workspaceId}
            onUploadComplete={fetchRecordings}
          />

          {/* Upcoming Meetings */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Upcoming Meetings
                </CardTitle>
                <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      View Calendar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Meeting Calendar</DialogTitle>
                      <DialogDescription>
                        View scheduled and live meetings.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid md:grid-cols-[300px_1fr] gap-4">
                      <CalendarPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        modifiers={{
                          hasMeeting: allCalendarMeetings
                            .filter((m) => m.started_at)
                            .map((m) => new Date(m.started_at!)),
                        }}
                        modifiersClassNames={{
                          hasMeeting: "bg-primary/15 text-primary font-semibold",
                        }}
                      />
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a date'}
                        </p>
                        {meetingsForSelectedDate.length === 0 && (
                          <p className="text-sm text-muted-foreground">No meetings scheduled.</p>
                        )}
                        {meetingsForSelectedDate.map((meeting) => (
                          <div key={meeting.id} className="p-3 border rounded-lg">
                            <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                            <p className="text-sm text-muted-foreground">
                              {safeFormat(meeting.started_at, 'h:mm a')} • {meeting.status}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <CardDescription>Your scheduled meetings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scheduledMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No scheduled meetings.</p>
              ) : (
                scheduledMeetings.slice(0, 3).map((meeting) => (
                  <div key={meeting.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Video className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {safeFormat(meeting.started_at, 'MMM d, h:mm a', 'Scheduled')}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`${basePath}/meeting/${meeting.id}`)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Open
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upload History - stored recordings with transcription, summary, action items */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileAudio className="h-5 w-5 text-primary" />
              Upload History
            </CardTitle>
            <CardDescription>
              All uploaded meeting recordings with transcription, summary, and action items
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recordingsLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading recordings…
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No uploaded recordings yet. Upload a meeting recording above to see it here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map((rec) => (
                  <RecordingHistoryItem key={rec.id} recording={rec} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meeting History — all meetings (scheduled, live, ended) so details update as soon as a meeting starts */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Meeting History</CardTitle>
            <CardDescription>All meetings. Open any meeting to see live transcript, details, and summary.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {allMeetingsForHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No meetings yet. Create or start one above.</p>
              ) : (
                allMeetingsForHistory.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`${basePath}/meeting/${meeting.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'h-10 w-10 rounded-lg flex items-center justify-center',
                          meeting.status === 'live' && 'bg-primary/10',
                          meeting.status === 'ended' && 'bg-success/10',
                          meeting.status === 'scheduled' && 'bg-muted'
                        )}
                      >
                        {meeting.status === 'live' ? (
                          <Play className="h-5 w-5 text-primary" />
                        ) : meeting.status === 'ended' ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                        <p className="text-sm text-muted-foreground">
                          {meeting.ended_at
                              ? safeFormat(meeting.ended_at, 'MMMM d, yyyy • h:mm a')
                              : meeting.started_at
                                ? `Started ${safeFormat(meeting.started_at, 'MMM d, h:mm a')}`
                                : 'Scheduled'}
                        </p>
                      </div>
                      <Badge variant={meeting.status === 'live' ? 'default' : 'secondary'} className="capitalize shrink-0">
                        {meeting.status}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`${basePath}/meeting/${meeting.id}`);
                      }}
                    >
                      {meeting.status === 'live' ? 'Open live' : 'View details'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ManagerMeetings;
