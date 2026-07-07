import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listProjects,
  createProject,
  joinProject,
  leaveProject,
  isUnauthorized,
  type ApiProject,
  type ProjectMember,
} from "@/lib/api";

export type WorkspaceRole = "manager" | "member";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  ownerId: string;
  ownerEmail: string;
  members: string[];
  membersCount: number;
  memberDetails: ProjectMember[];
}

interface WorkspaceContextValue {
  role: WorkspaceRole | null;
  workspaces: Workspace[];
  workspacesLoading: boolean;
  currentWorkspaceId: string | null;
  currentWorkspace: Workspace | null;
  currentUserEmail: string;
  setRole: (role: WorkspaceRole) => void;
  setCurrentWorkspaceId: (id: string) => void;
  ensureWorkspace: (id: string) => void;
  createWorkspace: (name: string, description: string, inviteCode: string) => Promise<Workspace>;
  joinWorkspace: (code: string) => Promise<Workspace>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  leaveWorkspace: (workspaceId: string) => Promise<boolean>;
  deleteAllWorkspaces: () => Promise<number>;
  addMemberToWorkspace: (workspaceId: string, memberEmail: string) => void;
  hasAccessToWorkspace: (workspaceId: string) => boolean;
  getWorkspaceByInviteCode: (code: string) => Workspace | null;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function mapApiProjectToWorkspace(p: ApiProject): Workspace {
  const details = Array.isArray(p.member_details) ? p.member_details : [];
  const owner = details.find((m) => m.id === p.owner_id);
  const memberEmails = details.map((m) => (m && typeof m === "object" && "email" in m ? m.email : "")).filter(Boolean);
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    inviteCode: p.invite_code,
    ownerId: p.owner_id,
    ownerEmail: owner?.email ?? "",
    members: memberEmails,
    membersCount: details.length,
    memberDetails: details,
  };
}

export const WorkspaceProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, token, logout } = useAuth();
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const currentUserEmail = user?.email ?? "";

  const fetchWorkspaces = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    try {
      const list = await listProjects(token, "workspace");
      setWorkspaces((Array.isArray(list) ? list : []).map(mapApiProjectToWorkspace));
      setCurrentWorkspaceId((id) => {
        const arr = Array.isArray(list) ? list : [];
        return id && arr.some((p) => p.id === id) ? id : (arr[0]?.id ?? null);
      });
    } catch (e) {
      if (isUnauthorized(e)) {
        logout();
      }
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    setLoading(true);
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!currentWorkspaceId && workspaces.length) {
      setCurrentWorkspaceId(workspaces[0].id);
    }
  }, [currentWorkspaceId, workspaces]);

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [currentWorkspaceId, workspaces],
  );

  const ensureWorkspace = useCallback(
    (id: string) => {
      if (workspaces.some((workspace) => workspace.id === id)) {
        setCurrentWorkspaceId(id);
      }
    },
    [workspaces],
  );

  const createWorkspace = useCallback(
    async (name: string, description: string, inviteCode: string) => {
      if (!token) throw new Error("Not authenticated");
      const created = await createProject(token, {
        name: name.trim(),
        description: description.trim(),
        invite_code: inviteCode.trim(),
        project_type: "workspace",
      });
      const workspace = mapApiProjectToWorkspace(created);
      setWorkspaces((prev) => [...prev, workspace]);
      setCurrentWorkspaceId(workspace.id);
      return workspace;
    },
    [token],
  );

  const joinWorkspace = useCallback(
    async (code: string) => {
      if (!token) throw new Error("Not authenticated");
      const joined = await joinProject(token, code);
      const workspace = mapApiProjectToWorkspace(joined);
      setWorkspaces((prev) => {
        if (prev.some((w) => w.id === workspace.id)) {
          return prev.map((w) => (w.id === workspace.id ? workspace : w));
        }
        return [...prev, workspace];
      });
      setCurrentWorkspaceId(workspace.id);
      return workspace;
    },
    [token],
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!token) return false;
      try {
        await leaveProject(token, workspaceId);
        setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
        setCurrentWorkspaceId((id) => (id === workspaceId ? null : id));
        return true;
      } catch {
        return false;
      }
    },
    [token],
  );

  const leaveWorkspace = useCallback(
    (workspaceId: string) => deleteWorkspace(workspaceId),
    [deleteWorkspace],
  );

  const deleteAllWorkspaces = useCallback(async () => {
    if (!token) return 0;
    const count = workspaces.length;
    if (count === 0) return 0;
    for (const w of workspaces) {
      try {
        await leaveProject(token, w.id);
      } catch {
        /* skip */
      }
    }
    setWorkspaces([]);
    setCurrentWorkspaceId(null);
    return count;
  }, [workspaces, token]);

  const addMemberToWorkspace = useCallback(
    (workspaceId: string, member: string) => {
      setWorkspaces((prev) =>
        prev.map((workspace) => {
          if (workspace.id !== workspaceId) {
            return workspace;
          }
          if (workspace.members.includes(member)) {
            return workspace;
          }
          const updatedMembers = [...workspace.members, member];
          return {
            ...workspace,
            members: updatedMembers,
            membersCount: updatedMembers.length,
          };
        }),
      );
    },
    [setWorkspaces],
  );

  const hasAccessToWorkspace = useCallback(
    (workspaceId: string) => {
      const workspace = workspaces.find((item) => item.id === workspaceId);
      if (!workspace) return false;
      return workspace.members.includes(currentUserEmail);
    },
    [workspaces, currentUserEmail],
  );

  const getWorkspaceByInviteCode = useCallback(
    (code: string) =>
      workspaces.find((workspace) => workspace.inviteCode.toLowerCase() === code.toLowerCase()) ??
      null,
    [workspaces],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      role,
      workspaces,
      currentWorkspaceId,
      currentWorkspace,
      currentUserEmail,
      setRole,
      setCurrentWorkspaceId,
      ensureWorkspace,
      createWorkspace,
      joinWorkspace,
      deleteWorkspace,
      leaveWorkspace,
      deleteAllWorkspaces,
      addMemberToWorkspace,
      hasAccessToWorkspace,
      getWorkspaceByInviteCode,
      refreshWorkspaces: fetchWorkspaces,
    }),
    [
      role,
      workspaces,
      loading,
      currentWorkspaceId,
      currentWorkspace,
      currentUserEmail,
      setRole,
      ensureWorkspace,
      createWorkspace,
      joinWorkspace,
      deleteWorkspace,
      leaveWorkspace,
      deleteAllWorkspaces,
      addMemberToWorkspace,
      hasAccessToWorkspace,
      getWorkspaceByInviteCode,
      fetchWorkspaces,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
