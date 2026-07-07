import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  LayoutGrid,
  Users,
  BarChart3,
  Settings,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { getProject, listMeetings, type MeetingBotListItem, type ApiTask, type ProjectMember } from '@/lib/api';

const ManagerDashboard = () => {
  const { user, token } = useAuth();
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const basePath = `/business/manager/workspaces/${workspaceId}`;
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [memberDetails, setMemberDetails] = useState<ProjectMember[]>([]);
  const [meetings, setMeetings] = useState<MeetingBotListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    try {
      const [projectRes, meetingsRes] = await Promise.all([
        getProject(token, workspaceId),
        listMeetings(token, workspaceId),
      ]);
      setTasks(projectRes.tasks ?? []);
      setMemberDetails(projectRes.member_details ?? []);
      setMeetings(meetingsRes.meetings ?? []);
    } catch {
      setTasks([]);
      setMemberDetails([]);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const liveMeeting = meetings.find((m) => m.status === 'live');
  const upcomingMeetings = meetings.filter((m) => m.status === 'scheduled').slice(0, 3);
  const endedMeetings = meetings.filter((m) => m.status === 'ended').slice(0, 2);

  const taskStats = {
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    review: tasks.filter((t) => t.status === 'in_review').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
  };
  const totalTasks = tasks.length;
  const teamScore = totalTasks > 0 ? Math.round((taskStats.done / totalTasks) * 100) : 0;

  const managerSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar, badge: upcomingMeetings.length },
    { title: 'Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: taskStats.todo + taskStats.inProgress },
    { title: 'Kanban Board', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Team', href: `${basePath}/team`, icon: Users },
    { title: 'Analytics', href: `${basePath}/analytics`, icon: BarChart3 },
    { title: 'Settings', href: `${basePath}/settings`, icon: Settings },
  ];

  const taskCountByMember = (memberId: string) =>
    tasks.filter((t) => t.assignee_id === memberId).length;
  const doneCountByMember = (memberId: string) =>
    tasks.filter((t) => t.assignee_id === memberId && t.status === 'done').length;

  return (
    <DashboardLayout
      sidebarItems={managerSidebarItems}
      sidebarTitle="Manager"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0] ?? 'there'}</h1>
            <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your team today.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`${basePath}/meetings`}>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Upload Recording
              </Button>
            </Link>
            <Link to={`${basePath}/meetings`}>
              <Button className="gradient-primary">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Meeting
              </Button>
            </Link>
          </div>
        </div>

        {/* Live Meeting Banner - only when API returns status 'live' */}
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

        {/* Stats Grid - real data */}
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Team Score</p>
                  <p className="text-3xl font-bold">{loading ? '—' : `${teamScore}%`}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Tasks completed</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tasks In Progress</p>
                  <p className="text-3xl font-bold">{loading ? '—' : taskStats.inProgress}</p>
                </div>
                <Clock className="h-5 w-5 text-primary/20" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {taskStats.todo} pending • {taskStats.review} in review
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-3xl font-bold">{loading ? '—' : taskStats.done}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-success/20" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Tasks done</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-3xl font-bold">{loading ? '—' : taskStats.overdue}</p>
                </div>
                <AlertCircle className="h-5 w-5 text-destructive/20" />
              </div>
              <p className="text-xs text-destructive mt-2">Needs attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Team Overview - from project member_details */}
          <Card className="shadow-card lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Overview</CardTitle>
                <CardDescription>Members in this workspace</CardDescription>
              </div>
              <Link to={`${basePath}/team`}>
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : memberDetails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet. Invite people with the workspace invite code.</p>
              ) : (
                <div className="space-y-4">
                  {memberDetails.map((member) => {
                    const assigned = taskCountByMember(member.id);
                    const done = doneCountByMember(member.id);
                    const pct = assigned > 0 ? Math.round((done / assigned) * 100) : 0;
                    return (
                      <div key={member.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{member.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{pct}%</p>
                          <p className="text-xs text-muted-foreground">{done}/{assigned} tasks</p>
                        </div>
                        <Progress value={pct} className="w-20 h-2" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Meetings - real from API */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Upcoming Meetings</CardTitle>
              <CardDescription>Scheduled meetings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {upcomingMeetings.map((meeting) => (
                  <div key={meeting.id} className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                    <p className="font-medium text-sm">{meeting.title ?? 'Meeting'}</p>
                    {meeting.started_at && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
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

        {/* Recent meetings (ended) - link to detail */}
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
                <div key={meeting.id} className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium">{meeting.title ?? 'Meeting'}</p>
                    {meeting.ended_at && (
                      <Badge variant="outline" className="text-xs">
                        {format(new Date(meeting.ended_at), 'MMM d')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Recording and summary available.</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-primary"
                    onClick={() => navigate(`${basePath}/meeting/${meeting.id}`)}
                  >
                    View full summary →
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

export default ManagerDashboard;
