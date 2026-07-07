import { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import Sidebar, { SidebarItem } from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '@/context/AuthContext';
import WorkspaceCopilot from '@/components/workspace/WorkspaceCopilot';

interface DashboardLayoutProps {
  children: ReactNode;
  sidebarItems: SidebarItem[];
  sidebarTitle: string;
  sidebarSubtitle?: string;
  showMeetingStatus?: boolean;
}

function WorkspaceCopilotHost() {
  const { workspaceId, meetingId } = useParams();
  const { token } = useAuth();
  if (!workspaceId) return null;
  return (
    <WorkspaceCopilot token={token} workspaceId={workspaceId} meetingId={meetingId} />
  );
}

const DashboardLayout = ({
  children,
  sidebarItems,
  sidebarTitle,
  sidebarSubtitle,
  showMeetingStatus = true,
}: DashboardLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar 
        items={sidebarItems} 
        title={sidebarTitle}
        subtitle={sidebarSubtitle}
      />
      <div className="flex-1 flex flex-col">
        <TopBar showMeetingStatus={showMeetingStatus} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
      <WorkspaceCopilotHost />
    </div>
  );
};

export default DashboardLayout;
