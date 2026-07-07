import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  LayoutGrid,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { getProject, updateProjectTask, type ApiTask } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const TeamMemberTasks = () => {
  const { user, token } = useAuth();
  const { workspaceId } = useParams();
  const basePath = `/business/member/workspaces/${workspaceId}`;
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    try {
      const project = await getProject(token, workspaceId);
      const myTasks = (project.tasks ?? []).filter((t) => t.assignee_id === user?.id);
      setTasks(myTasks);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId, user?.id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const overdueTasks = tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done');
  const pendingTasks = tasks.filter((t) => t.status !== 'done');
  const completedTasks = tasks.filter((t) => t.status === 'done');

  const teamMemberSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar },
    { title: 'My Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: pendingTasks.length },
    { title: 'Kanban', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Documents', href: `${basePath}/documents`, icon: FileText },
  ];

  const handleToggleDone = async (task: ApiTask) => {
    if (!token || !workspaceId) return;
    const newStatus: ApiTask['status'] = task.status === 'done' ? 'todo' : 'done';
    setUpdatingId(task.id);
    try {
      const updated = await updateProjectTask(token, workspaceId, task.id, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <DashboardLayout
      sidebarItems={teamMemberSidebarItems}
      sidebarTitle="Team Member"
      sidebarSubtitle="Personal Workspace"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          <p className="text-muted-foreground">Tasks assigned to you</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-destructive">{overdueTasks.length}</p>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-destructive/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-primary">{pendingTasks.length}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
                <Clock className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">{completedTasks.length}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-success/20" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>All My Tasks</CardTitle>
            <CardDescription>Tasks assigned to you in this workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">No tasks assigned to you yet.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50',
                      task.status === 'done' && 'opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={task.status === 'done'}
                        onCheckedChange={() => handleToggleDone(task)}
                        disabled={updatingId === task.id}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={cn('font-medium', task.status === 'done' && 'line-through')}>
                            {task.title}
                          </p>
                          {task.is_auto_generated && (
                            <Badge variant="outline" className="text-[10px] bg-secondary/10 border-secondary/30 text-secondary">
                              <Sparkles className="h-2 w-2 mr-1" />AI
                            </Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground">{task.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          task.priority === 'urgent' && 'border-destructive text-destructive bg-destructive/10',
                          task.priority === 'high' && 'border-warning text-warning bg-warning/10',
                          task.priority === 'medium' && 'border-primary text-primary bg-primary/10',
                          task.priority === 'low' && 'border-muted-foreground'
                        )}
                      >
                        {task.priority}
                      </Badge>
                      {task.due_date && (
                        <span
                          className={cn(
                            'text-sm flex items-center gap-1',
                            new Date(task.due_date) < new Date() && task.status !== 'done'
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                        </span>
                      )}
                      <Badge variant="secondary" className="capitalize">
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </div>
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

export default TeamMemberTasks;
