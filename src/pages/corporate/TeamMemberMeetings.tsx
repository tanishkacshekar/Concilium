import { 
  LayoutDashboard, 
  Calendar, 
  ListTodo, 
  LayoutGrid, 
  FileText,
  Video,
  Clock,
  CheckCircle2,
  Play,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import UploadMeeting from '@/components/meetings/UploadMeeting';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { listMeetings, type MeetingBotListItem } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

const TeamMemberMeetings = () => {
  const { workspaceId = "alpha" } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const basePath = `/business/member/workspaces/${workspaceId}`;
  const [botMeetings, setBotMeetings] = useState<MeetingBotListItem[]>([]);
  const [botMeetingsLoading, setBotMeetingsLoading] = useState(false);

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

  const teamMemberSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar },
    { title: 'My Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: 3 },
    { title: 'Kanban', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Documents', href: `${basePath}/documents`, icon: FileText },
  ];
  return (
    <DashboardLayout
      sidebarItems={teamMemberSidebarItems}
      sidebarTitle="Team Member"
      sidebarSubtitle="Personal Workspace"
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meetings</h1>
            <p className="text-muted-foreground">
              Join meetings or upload recordings for AI analysis
            </p>
          </div>
          <Button onClick={() => navigate(`${basePath}/meetings`)}>
            <Video className="h-4 w-4 mr-2" />
            Join Meeting
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <UploadMeeting variant="corporate" title="Upload Meeting Recording" />

          {/* Upcoming Meetings */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Upcoming Meetings
              </CardTitle>
              <CardDescription>Meetings you're invited to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {botMeetings.filter((m) => m.status === 'scheduled').slice(0, 3).map((meeting) => (
                <div key={meeting.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Video className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                      {meeting.started_at && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {format(new Date(meeting.started_at), 'MMM d, h:mm a')}
                        </p>
                      )}
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
              ))}
              {botMeetings.filter((m) => m.status === 'scheduled').length === 0 && !botMeetingsLoading && (
                <p className="text-sm text-muted-foreground">No upcoming meetings.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Meeting History */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Meeting History</CardTitle>
            <CardDescription>Past meetings with AI-generated summaries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {botMeetings.filter((m) => m.status === 'ended').map((meeting) => (
                <div key={meeting.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`${basePath}/meeting/${meeting.id}`)}>
                  <div className="flex items-center gap-4">
                    <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', 'bg-success/10')}>
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                      <p className="text-sm text-muted-foreground">
                        {meeting.ended_at ? format(new Date(meeting.ended_at), 'MMMM d, yyyy • h:mm a') : meeting.started_at ? format(new Date(meeting.started_at), 'MMMM d, yyyy') : '—'}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/meeting/${meeting.id}`); }}>
                    View Summary
                  </Button>
                </div>
              ))}
              {botMeetings.filter((m) => m.status === 'ended').length === 0 && !botMeetingsLoading && (
                <p className="text-sm text-muted-foreground">No past meetings yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamMemberMeetings;
