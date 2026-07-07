import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  LayoutGrid,
  FileText,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Radio,
  Upload,
} from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { getProject, listMeetings, type ApiTask, type MeetingBotListItem } from '@/lib/api';

const TeamMemberDashboard = () => {
  const { user, token } = useAuth();
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const basePath = `/business/member/workspaces/${workspaceId}`;
  const [myTasks, setMyTasks] = useState<ApiTask[]>([]);
  const [meetings, setMeetings] = useState<MeetingBotListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    try {
      const [project, meetingsRes] = await Promise.all([
        getProject(token, workspaceId),
        listMeetings(token, workspaceId),
      ]);
      const tasks = (project.tasks ?? []).filter((t) => t.assignee_id === user?.id);
      setMyTasks(tasks);
      setMeetings(meetingsRes.meetings ?? []);
    } catch {
      setMyTasks([]);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const liveMeeting = meetings.find((m) => m.status === 'live');
  const upcomingMeetings = meetings.filter((m) => m.status === 'scheduled').slice(0, 3);
  const endedMeetings = meetings.filter((m) => m.status === 'ended').slice(0, 2);

  const pendingCount = myTasks.filter((t) => t.status !== 'done').length;
  const completedCount = myTasks.filter((t) => t.status === 'done').length;
  const totalTasks = myTasks.length;
  const progressPercent = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

  const teamMemberSidebarItems: SidebarItem[] = [
    { title: 'My Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar, badge: upcomingMeetings.length },
    { title: 'My Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: pendingCount },
    { title: 'Kanban', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Documents', href: `${basePath}/documents`, icon: FileText },
  ];

  return (
    <DashboardLayout
      sidebarItems={teamMemberSidebarItems}
      sidebarTitle="Team Member"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Good morning, {user?.name?.split(' ')[0] ?? 'there'}</h1>
            <p className="text-muted-foreground">You have {pendingCount} tasks to work on today.</p>
          </div>
          <Link to={`${basePath}/meetings`}>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Upload Recording
            </Button>
          </Link>
        </div>

        {liveMeeting && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                    <Radio className="h-5 w-5 text-success animate-pulse" />
                  </div>
                  <div>
                    <p className="font-medium">{liveMeeting.title ?? 'Live Meeting'}</p>
                    <p className="text-sm text-muted-foreground">Live now</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-success text-success hover:bg-success/10"
                  onClick={() =>
                    liveMeeting.meeting_url
                      ? window.open(liveMeeting.meeting_url)
                      : navigate(`${basePath}/meeting/${liveMeeting.id}`)
                  }
                >
                  Join Meeting
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">My Progress</p>
                <p className="text-2xl font-bold">{completedCount} of {totalTasks} tasks completed</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-primary">{Math.round(progressPercent)}%</p>
                <p className="text-sm text-muted-foreground">completion rate</p>
              </div>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="shadow-card lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>My Tasks</CardTitle>
                <CardDescription>Tasks assigned to you</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/tasks`)}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : myTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks assigned to you yet.</p>
              ) : (
                <div className="space-y-3">
                  {myTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow"
                    >
                      <Checkbox checked={task.status === 'done'} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                            {task.title}
                          </p>
                          {task.is_auto_generated && (
                            <Badge variant="outline" className="text-xs bg-secondary/10 border-secondary/30 text-secondary">
                              <Sparkles className="h-2.5 w-2.5 mr-1" />AI
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {task.due_date ? formatDistanceToNow(new Date(task.due_date), { addSuffix: true }) : 'No deadline'}
                          </span>
                          <Badge variant="outline" className="text-xs">{task.priority}</Badge>
                          <Badge variant="secondary" className="text-xs capitalize">{task.status.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`${basePath}/tasks`)}>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Upcoming Meetings</CardTitle>
              <CardDescription>Your schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {upcomingMeetings.map((meeting) => (
                  <div key={meeting.id} className="p-3 rounded-lg border">
                    <p className="font-medium text-sm mb-1">{meeting.title ?? 'Meeting'}</p>
                    {meeting.started_at && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(meeting.started_at), 'h:mm a')}
                      </div>
                    )}
                  </div>
                ))}
                {!loading && upcomingMeetings.length === 0 && (
                  <p className="text-sm text-muted-foreground">No upcoming meetings.</p>
                )}
                <Link to={`${basePath}/meetings`}>
                  <Button variant="outline" className="w-full" size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    View Meetings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-secondary" />
                Recent Meetings
              </CardTitle>
              <CardDescription>View summaries and action items</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/meetings`)}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {endedMeetings.map((meeting) => (
                <div key={meeting.id} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                    {meeting.ended_at && (
                      <Badge variant="outline" className="text-xs">
                        {format(new Date(meeting.ended_at), 'MMM d')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Summary available.</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-primary"
                    onClick={() => navigate(`${basePath}/meeting/${meeting.id}`)}
                  >
                    View full notes →
                  </Button>
                </div>
              ))}
              {!loading && endedMeetings.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-2">No recent meetings yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamMemberDashboard;
