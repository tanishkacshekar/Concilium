import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ArrowRight, Trash2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useWorkspace, WorkspaceRole } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import CreateWorkspaceModal from "./CreateWorkspaceModal";
import JoinWorkspaceModal from "./JoinWorkspaceModal";

interface WorkspaceListProps {
  role: WorkspaceRole;
}

const WorkspaceList = ({ role }: WorkspaceListProps) => {
  const { user } = useAuth();
  const { workspaces, currentWorkspaceId, setRole, hasAccessToWorkspace, deleteWorkspace, deleteAllWorkspaces } = useWorkspace();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  useEffect(() => {
    setRole(role);
  }, [role, setRole]);

  const basePath = useMemo(
    () => (role === "manager" ? "/business/manager/workspaces" : "/business/member/workspaces"),
    [role],
  );

  const canCreate = role === "manager";
  const visibleWorkspaces = useMemo(() => {
    if (role === "manager") {
      return workspaces.filter((w) => w.ownerId === user?.id);
    }
    return workspaces.filter((workspace) => hasAccessToWorkspace(workspace.id));
  }, [role, workspaces, user?.id, hasAccessToWorkspace]);
  const myProjectCount = visibleWorkspaces.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {role === "manager" ? "Your Projects" : "Joined Projects"}
            </h1>
            <p className="text-muted-foreground">
              {role === "manager"
                ? "Create and manage workspaces for your teams."
                : "Join a project to access your workspace tools."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {myProjectCount > 0 && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => setShowDeleteAllDialog(true)}
              >
                <Trash className="h-4 w-4 mr-2" />
                Delete all projects
              </Button>
            )}
            {canCreate ? (
              <CreateWorkspaceModal />
            ) : (
              <JoinWorkspaceModal />
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleWorkspaces.map((workspace) => (
            <Card key={workspace.id} className="shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{workspace.id}</Badge>
                  {currentWorkspaceId === workspace.id && (
                    <Badge className="bg-success/10 text-success border border-success/20">
                      Active
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg">{workspace.name}</CardTitle>
                <CardDescription className="space-y-2">
                  <span className="block text-sm">{workspace.description}</span>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {workspace.membersCount} members
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" asChild>
                  <Link to={`${basePath}/${workspace.id}/dashboard`}>
                    Open Workspace
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/50 hover:bg-destructive/10"
                    onClick={() => setDeleteTargetId(workspace.id)}
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                  </Button>
                  {role === "manager" ? (
                    <Badge className="bg-primary/10 text-primary border border-primary/20">Owner</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground border border-muted">Member</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              You will leave this project. It will no longer appear on your dashboard and your name will be removed from the team. You can rejoin later with an invite code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTargetId) {
                  await deleteWorkspace(deleteTargetId);
                  setDeleteTargetId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all projects?</AlertDialogTitle>
            <AlertDialogDescription>
              You will leave all {myProjectCount} project(s). They will no longer appear on your dashboard and your name will be removed from the teams.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await deleteAllWorkspaces();
                setShowDeleteAllDialog(false);
              }}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkspaceList;
