import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/context/WorkspaceContext";

const WorkspaceSwitcher = () => {
  const { workspaces, currentWorkspaceId, setCurrentWorkspaceId, role, setRole, hasAccessToWorkspace } =
    useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const derivedRole = useMemo(() => {
    if (location.pathname.includes("/business/manager/")) {
      return "manager";
    }
    if (location.pathname.includes("/business/member/")) {
      return "member";
    }
    return null;
  }, [location.pathname]);

  useEffect(() => {
    if (derivedRole && role !== derivedRole) {
      setRole(derivedRole);
    }
  }, [derivedRole, role, setRole]);

  if (!derivedRole) {
    return null;
  }

  const basePath =
    derivedRole === "manager" ? "/business/manager/workspaces" : "/business/member/workspaces";

  const visibleWorkspaces =
    role === "member" ? workspaces.filter((workspace) => hasAccessToWorkspace(workspace.id)) : workspaces;
  const activeWorkspace =
    visibleWorkspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? visibleWorkspaces[0];

  const handleSwitch = (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId);
    navigate(`${basePath}/${workspaceId}/dashboard`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="w-full justify-between">
          <span className="flex items-center gap-2 truncate">
            <Folder className="h-4 w-4" />
            {activeWorkspace?.name ?? "Select workspace"}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleWorkspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onClick={() => handleSwitch(workspace.id)}>
            <span className="truncate">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceSwitcher;
