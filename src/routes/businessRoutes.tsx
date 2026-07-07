import { useEffect } from "react";
import { Navigate, Outlet, Route, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { joinProject } from "@/lib/api";
import CorporateRoleSelect from "@/pages/corporate/RoleSelect";
import ManagerDashboard from "@/pages/corporate/ManagerDashboard";
import ManagerMeetings from "@/pages/corporate/ManagerMeetings";
import ManagerTasks from "@/pages/corporate/ManagerTasks";
import ManagerKanban from "@/pages/corporate/ManagerKanban";
import ManagerTeam from "@/pages/corporate/ManagerTeam";
import ManagerAnalytics from "@/pages/corporate/ManagerAnalytics";
import ManagerSettings from "@/pages/corporate/ManagerSettings";
import CorporateMeetingDetails from "@/pages/corporate/CorporateMeetingDetails";
import TeamMemberDashboard from "@/pages/corporate/TeamMemberDashboard";
import TeamMemberMeetings from "@/pages/corporate/TeamMemberMeetings";
import TeamMemberTasks from "@/pages/corporate/TeamMemberTasks";
import TeamMemberKanban from "@/pages/corporate/TeamMemberKanban";
import TeamMemberDocuments from "@/pages/corporate/TeamMemberDocuments";
import WorkspaceList from "@/features/workspaces/WorkspaceList";
import { useWorkspace, WorkspaceRole } from "@/context/WorkspaceContext";

const WorkspaceGate = ({ role }: { role: WorkspaceRole }) => {
  const { workspaceId } = useParams();
  const { setRole, ensureWorkspace, hasAccessToWorkspace, workspacesLoading } = useWorkspace();
  const navigate = useNavigate();
  const basePath =
    role === "manager" ? "/business/manager/workspaces" : "/business/member/workspaces";

  useEffect(() => {
    setRole(role);
    if (workspaceId) {
      ensureWorkspace(workspaceId);
    }
  }, [role, setRole, ensureWorkspace, workspaceId]);

  useEffect(() => {
    if (workspacesLoading || !workspaceId) return;
    if (!hasAccessToWorkspace(workspaceId)) {
      navigate(basePath, { replace: true });
    }
  }, [workspacesLoading, workspaceId, hasAccessToWorkspace, navigate, basePath]);

  if (workspacesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground flex items-center gap-2">
          <span className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading workspace…
        </div>
      </div>
    );
  }

  return <Outlet />;
};

const JoinWorkspaceRoute = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { joinWorkspace, getWorkspaceByInviteCode, setRole, refreshWorkspaces } = useWorkspace();

  useEffect(() => {
    setRole("member");
    if (!code) {
      navigate("/business/member/workspaces", { replace: true });
      return;
    }
    const workspace = getWorkspaceByInviteCode(code);
    if (workspace) {
      joinWorkspace(code);
      navigate(`/business/member/workspaces/${workspace.id}/dashboard`, { replace: true });
      return;
    }
    if (!token) {
      navigate("/business/member/workspaces", { replace: true });
      return;
    }
    joinProject(token, code)
      .then(async (project) => {
        await refreshWorkspaces();
        navigate(`/business/member/workspaces/${project.id}/dashboard`, { replace: true });
      })
      .catch(() => {
        navigate("/business/member/workspaces", { replace: true });
      });
  }, [code, token, joinWorkspace, getWorkspaceByInviteCode, refreshWorkspaces, navigate, setRole]);

  return null;
};

export const businessRoutes = (
  <>
    <Route path="/business" element={<CorporateRoleSelect />} />
    <Route path="/join/workspace/:code" element={<JoinWorkspaceRoute />} />

    <Route path="/business/manager/workspaces" element={<WorkspaceList role="manager" />} />
    <Route path="/business/manager/workspaces/:workspaceId" element={<WorkspaceGate role="manager" />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<ManagerDashboard />} />
      <Route path="meetings" element={<ManagerMeetings />} />
      <Route path="tasks" element={<ManagerTasks />} />
      <Route path="kanban" element={<ManagerKanban />} />
      <Route path="team" element={<ManagerTeam />} />
      <Route path="analytics" element={<ManagerAnalytics />} />
      <Route path="meeting/:meetingId" element={<CorporateMeetingDetails role="manager" />} />
      <Route path="settings" element={<ManagerSettings />} />
    </Route>

    <Route path="/business/member/workspaces" element={<WorkspaceList role="member" />} />
    <Route path="/business/member/workspaces/:workspaceId" element={<WorkspaceGate role="member" />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<TeamMemberDashboard />} />
      <Route path="meetings" element={<TeamMemberMeetings />} />
      <Route path="tasks" element={<TeamMemberTasks />} />
      <Route path="kanban" element={<TeamMemberKanban />} />
      <Route path="meeting/:meetingId" element={<CorporateMeetingDetails role="member" />} />
      <Route path="documents" element={<TeamMemberDocuments />} />
    </Route>
  </>
);
