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
  Loader2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getProject, listMeetings, type ApiTask, type ProjectMember } from '@/lib/api';

const ManagerAnalytics = () => {
  const { token } = useAuth();
  const { workspaceId } = useParams();
  const basePath = `/business/manager/workspaces/${workspaceId}`;
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [memberDetails, setMemberDetails] = useState<ProjectMember[]>([]);
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    try {
      const [project, meetingsRes] = await Promise.all([
        getProject(token, workspaceId),
        listMeetings(token, workspaceId),
      ]);
      setTasks(project.tasks ?? []);
      setMemberDetails(project.member_details ?? []);
      setMeetingsCount((meetingsRes.meetings ?? []).filter((m) => m.status === 'ended').length);
    } catch {
      setTasks([]);
      setMemberDetails([]);
      setMeetingsCount(0);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalTasks = tasks.length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const teamScore = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const statusCounts = [
    { name: 'Done', value: tasks.filter((t) => t.status === 'done').length, color: 'hsl(var(--success))' },
    { name: 'To Do', value: tasks.filter((t) => t.status === 'todo').length, color: 'hsl(var(--muted-foreground))' },
    { name: 'In Progress', value: tasks.filter((t) => t.status === 'in_progress').length, color: 'hsl(var(--primary))' },
    { name: 'In Review', value: tasks.filter((t) => t.status === 'in_review').length, color: 'hsl(38 92% 50%)' },
    { name: 'Blockers', value: tasks.filter((t) => t.status === 'blockers').length, color: 'hsl(var(--destructive))' },
  ].filter((d) => d.value > 0);
  const memberMetrics = memberDetails.map((member) => {
    const memberTasks = tasks.filter((t) => t.assignee_id === member.id);
    const completed = memberTasks.filter((t) => t.status === 'done').length;
    const contributionScore = memberTasks.length > 0 ? Math.round((completed / memberTasks.length) * 100) : 0;
    return {
      member: { ...member, role: member.id ? 'Member' : '', avatar: null as string | null },
      contributionScore,
      tasksCompleted: completed,
      meetingParticipation: 0,
      trend: 'stable' as const,
    };
  });

  const managerSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar },
    { title: 'Tasks', href: `${basePath}/tasks`, icon: ListTodo },
    { title: 'Kanban Board', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Team', href: `${basePath}/team`, icon: Users },
    { title: 'Analytics', href: `${basePath}/analytics`, icon: BarChart3 },
    { title: 'Settings', href: `${basePath}/settings`, icon: Settings },
  ];

  return (
    <DashboardLayout
      sidebarItems={managerSidebarItems}
      sidebarTitle="Manager"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team Analytics</h1>
            <p className="text-muted-foreground">Track team performance and productivity</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="rounded-premium shadow-neumorphic bg-gradient-to-br from-primary/5 to-secondary/5 border-0 hover-lift transition-shadow">
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-12 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-24 w-24 rounded-full" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Team completion rate</p>
                    <p className="text-5xl font-bold">{teamScore}%</p>
                    <p className="text-xs text-muted-foreground mt-2">{doneCount} of {totalTasks} tasks done</p>
                  </div>
                  <div className="h-24 w-24 rounded-full border-8 border-primary/20 flex items-center justify-center shadow-glow">
                    <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center">
                      <TrendingUp className="h-8 w-8 text-primary-foreground" />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-premium shadow-neumorphic border-0 hover-lift">
            <CardContent className="pt-6">
              {loading ? <Skeleton className="h-16 w-full" /> : (
                <>
                  <p className="text-sm text-muted-foreground">Meetings held</p>
                  <p className="text-3xl font-bold mt-1">{meetingsCount}</p>
                  <p className="text-xs text-muted-foreground mt-2">Ended</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {!loading && (statusCounts.length > 0) && (
          <Card className="rounded-premium-lg shadow-neumorphic border-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Task status</CardTitle>
              <CardDescription>Distribution by status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      isAnimationActive
                      animationDuration={600}
                      animationEasing="ease-out"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusCounts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-premium shadow-neumorphic border-0">
          <CardHeader>
            <CardTitle>Individual Performance</CardTitle>
            <CardDescription>Task completion by member</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-2 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            ) : memberMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No member data yet.</p>
            ) : (
              <div className="space-y-4">
                {memberMetrics.map((metric) => (
                  <div key={metric.member.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{metric.member.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{metric.member.name}</p>
                      <p className="text-sm text-muted-foreground">{metric.member.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{metric.contributionScore}%</p>
                      <p className="text-xs text-muted-foreground">{metric.tasksCompleted} tasks</p>
                    </div>
                    <Progress value={metric.contributionScore} className="w-24 h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ManagerAnalytics;
