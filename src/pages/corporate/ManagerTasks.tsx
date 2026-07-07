import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  LayoutGrid,
  Users,
  BarChart3,
  Settings,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Sparkles,
  Loader2,
  Trash2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskPriority, TaskStatus } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getProject,
  createProjectTask,
  updateProjectTask,
  deleteTask,
  type ApiTask,
  type ProjectMember,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ManagerTasks = () => {
  const { token } = useAuth();
  const { workspaceId } = useParams();
  const basePath = `/business/manager/workspaces/${workspaceId}`;
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [memberDetails, setMemberDetails] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    try {
      const project = await getProject(token, workspaceId);
      setTasks(project.tasks ?? []);
      setMemberDetails(project.member_details ?? []);
    } catch {
      setTasks([]);
      setMemberDetails([]);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const managerSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar },
    { title: 'Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress').length },
    { title: 'Kanban Board', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Team', href: `${basePath}/team`, icon: Users },
    { title: 'Analytics', href: `${basePath}/analytics`, icon: BarChart3 },
    { title: 'Settings', href: `${basePath}/settings`, icon: Settings },
  ];

  const overdueTasks = tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done');
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress');
  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const completedTasks = tasks.filter((t) => t.status === 'done');

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      if (filterAssignee !== 'all' && task.assignee_id !== filterAssignee) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterAssignee]);

  const getAssignee = (assigneeId: string | null) =>
    assigneeId ? memberDetails.find((m) => m.id === assigneeId) : null;

  const handleCreateTask = async () => {
    if (!title.trim() || !token || !workspaceId) return;
    try {
      const created = await createProjectTask(token, workspaceId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee_id: assigneeId || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      });
      setTasks((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('medium');
      setAssigneeId(null);
      setDueDate('');
      setCreateOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

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

  const handleDeleteTask = async (taskId: string) => {
    if (!token) return;
    try {
      await deleteTask(token, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDeleteTargetId(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DashboardLayout
      sidebarItems={managerSidebarItems}
      sidebarTitle="Manager"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-muted-foreground">Create and manage tasks for this workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Filter tasks</DialogTitle>
                  <DialogDescription>Filter by status, assignee, or priority.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TaskStatus | 'all')}>
                      <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="todo">Todo</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                        <SelectItem value="blockers">Blockers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assignee</Label>
                    <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                      <SelectTrigger><SelectValue placeholder="All assignees" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {memberDetails.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as TaskPriority | 'all')}>
                      <SelectTrigger><SelectValue placeholder="All priorities" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setFilterStatus('all'); setFilterAssignee('all'); setFilterPriority('all'); }}>Clear</Button>
                  <Button onClick={() => setFilterOpen(false)}>Apply</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Task</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create task</DialogTitle>
                  <DialogDescription>Add a task to this workspace.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Label htmlFor="task-title">Title</Label>
                  <Input id="task-title" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <Label htmlFor="task-description">Description</Label>
                  <Textarea id="task-description" placeholder="Optional details..." value={description} onChange={(e) => setDescription(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">Todo</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="in_review">In Review</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                          <SelectItem value="blockers">Blockers</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Assignee</Label>
                    <Select value={assigneeId ?? 'unassigned'} onValueChange={(v) => setAssigneeId(v === 'unassigned' ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {memberDetails.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateTask} disabled={!title.trim()}>Add Task</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
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
                  <p className="text-2xl font-bold text-primary">{inProgressTasks.length}</p>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                </div>
                <Clock className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{todoTasks.length}</p>
                  <p className="text-sm text-muted-foreground">To Do</p>
                </div>
                <ListTodo className="h-8 w-8 text-muted-foreground/20" />
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

        {/* Task List */}
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>All Tasks</CardTitle>
              <CardDescription>Tasks in this workspace</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p className="mb-2">No tasks yet.</p>
                <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Task</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => {
                  const assignee = getAssignee(task.assignee_id);
                  return (
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
                        {assignee && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {assignee.name.split(' ').map((n) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                        )}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTargetId(task.id)}
                          aria-label="Delete task"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTargetId && handleDeleteTask(deleteTargetId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default ManagerTasks;
