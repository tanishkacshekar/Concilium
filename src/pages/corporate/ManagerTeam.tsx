import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  LayoutGrid,
  Users,
  BarChart3,
  Settings,
  Plus,
  Mail,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TeamMember } from '@/lib/types';
import { getProject, type ApiTask } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

function memberTaskStats(memberId: string, memberName: string, tasks: ApiTask[]) {
  const norm = (s: string | undefined | null) => (s || '').trim().toLowerCase();
  const nameL = norm(memberName);
  const mine = tasks.filter((t) => {
    if (t.assignee_id && t.assignee_id === memberId) return true;
    if (nameL && t.assignee_name && norm(t.assignee_name) === nameL) return true;
    return false;
  });
  const total = mine.length;
  const completed = mine.filter((t) => t.status === 'done').length;
  return {
    tasksCompleted: completed,
    totalTasks: total,
    productivityScore: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

const ManagerTeam = () => {
  const { workspaceId = "alpha" } = useParams();
  const basePath = `/business/manager/workspaces/${workspaceId}`;
  const { currentWorkspace, addMemberToWorkspace, refreshWorkspaces } = useWorkspace();
  const { token } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  type EditableMember = TeamMember & { designation?: string };
  const [newMember, setNewMember] = useState("");
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const inviteCode = currentWorkspace?.inviteCode ?? "N/A";
  const inviteLink = `${window.location.origin}/join/workspace/${inviteCode}`;
  const isValid = useMemo(() => {
    const value = newMember.trim();
    if (!value) return false;
    if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return value.length >= 3;
  }, [newMember]);

  const loadTasks = useCallback(async () => {
    if (!token || !workspaceId) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    try {
      const project = await getProject(token, workspaceId);
      setTasks(project.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [token, workspaceId]);

  const teamMembers: EditableMember[] = useMemo(() => {
    const details = currentWorkspace?.memberDetails ?? [];
    const ownerId = currentWorkspace?.ownerId;
    return details.map((m) => {
      const st = memberTaskStats(m.id, m.name, tasks);
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.name)}`,
        role: m.id === ownerId ? 'Owner' : 'Member',
        status: 'active' as const,
        productivityScore: st.productivityScore,
        tasksCompleted: st.tasksCompleted,
        totalTasks: st.totalTasks,
      };
    });
  }, [currentWorkspace?.memberDetails, currentWorkspace?.ownerId, tasks]);

  const teamWideDone = useMemo(
    () => tasks.filter((t) => t.status === 'done').length,
    [tasks],
  );
  const teamWideTotal = tasks.length;
  const teamWidePct =
    teamWideTotal > 0 ? Math.round((teamWideDone / teamWideTotal) * 100) : 0;
  const memberScoresWithTasks = teamMembers.filter((m) => m.totalTasks > 0).map((m) => m.productivityScore);
  const avgProductivity =
    memberScoresWithTasks.length > 0
      ? Math.round(memberScoresWithTasks.reduce((a, b) => a + b, 0) / memberScoresWithTasks.length)
      : teamWidePct;
  const weekMs = 7 * 86400000;
  const tasksThisWeek = tasks.filter((t) => {
    const u = t.updated_at ? new Date(t.updated_at).getTime() : 0;
    return u > 0 && Date.now() - u <= weekMs;
  }).length;

  useEffect(() => {
    refreshWorkspaces();
  }, [workspaceId, refreshWorkspaces]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const managerSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar, badge: 3 },
    { title: 'Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: 5 },
    { title: 'Kanban Board', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Team', href: `${basePath}/team`, icon: Users },
    { title: 'Analytics', href: `${basePath}/analytics`, icon: BarChart3, isPremium: true },
    { title: 'Settings', href: `${basePath}/settings`, icon: Settings },
  ];
  const statusColors: Record<string, string> = {
    active: 'bg-success',
    away: 'bg-warning',
    busy: 'bg-destructive',
    offline: 'bg-muted-foreground',
  };

  return (
    <DashboardLayout
      sidebarItems={managerSidebarItems}
      sidebarTitle="Manager"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            <p className="text-muted-foreground">
              Manage workspace members. Productivity is based on Kanban tasks assigned to each person.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite to workspace</DialogTitle>
                  <DialogDescription>Share the invite code or link.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Invite Code</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="flex-1 justify-start" disabled>
                        {inviteCode}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => navigator.clipboard.writeText(inviteCode)}
                      >
                        Copy Code
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Invite Link</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="flex-1 justify-start" disabled>
                        {inviteLink}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                      >
                        Copy Link
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a team member</DialogTitle>
                  <DialogDescription>
                    Enter a username or email to add them to this workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Label htmlFor="member-input">Username or Email</Label>
                  <Input
                    id="member-input"
                    placeholder="e.g. alex.kim@company.com"
                    value={newMember}
                    onChange={(event) => {
                      setNewMember(event.target.value);
                      setError("");
                    }}
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    disabled={!isValid}
                    onClick={() => {
                      if (!isValid || !currentWorkspace) {
                        setError("Enter a valid username or email.");
                        return;
                      }
                      const normalized = newMember.trim().toLowerCase();
                      addMemberToWorkspace(currentWorkspace.id, normalized);
                      void refreshWorkspaces();
                      void loadTasks();
                      setNewMember("");
                    }}
                  >
                    Add Member
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {currentWorkspace && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Workspace Members</CardTitle>
              <CardDescription>All team members with access to this workspace (from database)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(currentWorkspace.memberDetails ?? []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground">{m.email}</span>
                    <Badge variant={m.id === currentWorkspace.ownerId ? "default" : "secondary"}>
                      {m.id === currentWorkspace.ownerId ? "Owner" : "Member"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{teamMembers.length}</p>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                </div>
                <Users className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">
                    {teamMembers.filter(m => m.status === 'active').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active Now</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    {tasksLoading ? '…' : `${avgProductivity}%`}
                  </p>
                  <p className="text-sm text-muted-foreground">Avg completion (assigned tasks)</p>
                </div>
                <TrendingUp className="h-8 w-8 text-success/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{tasksLoading ? '…' : tasksThisWeek}</p>
                  <p className="text-sm text-muted-foreground">Tasks touched (7d)</p>
                </div>
                <ListTodo className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Members Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamMembers.map((member) => (
            <Card key={member.id} className="shadow-card hover:shadow-hover transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                        statusColors[member.status]
                      )} />
                    </div>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.role}
                        {member.designation ? ` • ${member.designation}` : ""}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedMember(member);
                          setEditName(member.name);
                          setEditRole(member.role);
                          setEditDesignation(member.designation ?? "");
                          setEditOpen(true);
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Task completion</span>
                      <span className="font-medium flex items-center gap-1">
                        {member.totalTasks === 0 ? (
                          <span className="text-muted-foreground font-normal">No tasks assigned</span>
                        ) : (
                          <>
                            {member.productivityScore}%
                            {member.productivityScore >= 80 ? (
                              <TrendingUp className="h-3 w-3 text-success" />
                            ) : member.productivityScore >= 40 ? (
                              <Minus className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-destructive" />
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <Progress
                      value={member.totalTasks === 0 ? 0 : member.productivityScore}
                      className="h-2"
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tasks</span>
                    <span className="font-medium">
                      {member.tasksCompleted}/{member.totalTasks} done
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Badge variant="outline" className="capitalize text-xs">
                      {member.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2"
                      onClick={() => {
                        setSelectedMember(member);
                        setMessageOpen(true);
                      }}
                    >
                      <Mail className="h-3 w-3 mr-1" />
                      Message
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>Update name, role, or designation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
            <Label htmlFor="edit-role">Role</Label>
            <Input
              id="edit-role"
              value={editRole}
              onChange={(event) => setEditRole(event.target.value)}
            />
            <Label htmlFor="edit-designation">Designation</Label>
            <Input
              id="edit-designation"
              placeholder="Optional"
              value={editDesignation}
              onChange={(event) => setEditDesignation(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                toast({
                  title: 'Member profiles',
                  description: 'Names and roles come from user accounts. Invite or remove members from this workspace instead.',
                });
                setEditOpen(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {selectedMember?.name}</DialogTitle>
            <DialogDescription>Chat placeholder for future integration.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Write a message..." />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMessageOpen(false)}>
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ManagerTeam;
