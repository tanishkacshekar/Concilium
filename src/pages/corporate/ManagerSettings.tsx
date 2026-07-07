import { 
  LayoutDashboard, 
  Calendar, 
  ListTodo, 
  LayoutGrid, 
  Users, 
  BarChart3, 
  Settings,
  Bell,
  Shield,
  Palette,
  Globe,
  CreditCard,
  HelpCircle,
  ChevronRight
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SidebarItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useParams } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';

const settingsSections = [
  {
    icon: Bell,
    title: 'Notifications',
    description: 'Configure how you receive alerts and updates',
  },
  {
    icon: Shield,
    title: 'Privacy & Security',
    description: 'Manage your account security settings',
  },
  {
    icon: Palette,
    title: 'Appearance',
    description: 'Customize the look and feel',
  },
  {
    icon: Globe,
    title: 'Language & Region',
    description: 'Set your language and timezone preferences',
  },
  {
    icon: CreditCard,
    title: 'Billing & Subscription',
    description: 'Manage your plan and payment methods',
  },
  {
    icon: HelpCircle,
    title: 'Help & Support',
    description: 'Get help and contact support',
  },
];

const ManagerSettings = () => {
  const { workspaceId = "alpha" } = useParams();
  const basePath = `/business/manager/workspaces/${workspaceId}`;
  const { currentWorkspace } = useWorkspace();
  const inviteCode = currentWorkspace?.inviteCode ?? "N/A";
  const inviteLink = `${window.location.origin}/join/workspace/${inviteCode}`;
  const handleCopy = (value: string) => {
    void navigator.clipboard.writeText(value);
  };
  const managerSidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: 'Meetings', href: `${basePath}/meetings`, icon: Calendar, badge: 3 },
    { title: 'Tasks', href: `${basePath}/tasks`, icon: ListTodo, badge: 5 },
    { title: 'Kanban Board', href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: 'Team', href: `${basePath}/team`, icon: Users },
    { title: 'Analytics', href: `${basePath}/analytics`, icon: BarChart3, isPremium: true },
    { title: 'Settings', href: `${basePath}/settings`, icon: Settings },
  ];
  return (
    <DashboardLayout
      sidebarItems={managerSidebarItems}
      sidebarTitle="Manager"
      sidebarSubtitle="Business Dashboard"
    >
      <div className="space-y-6 max-w-4xl">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Workspace Invite</CardTitle>
            <CardDescription>Share access to this workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label>Invite Code</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="justify-start flex-1" disabled>
                  {inviteCode}
                </Button>
                <Button variant="secondary" onClick={() => handleCopy(inviteCode)}>
                  Copy Code
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Invite Link</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="justify-start flex-1" disabled>
                  {inviteLink}
                </Button>
                <Button variant="secondary" onClick={() => handleCopy(inviteLink)}>
                  Copy Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and application preferences
          </p>
        </div>

        {/* Notification Preferences */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Choose what notifications you receive</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Task Assignments</Label>
                <p className="text-sm text-muted-foreground">Get notified when tasks are assigned to you</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Meeting Summaries</Label>
                <p className="text-sm text-muted-foreground">Receive AI-generated summaries after meetings</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Deadline Reminders</Label>
                <p className="text-sm text-muted-foreground">Get reminded about upcoming deadlines</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Team Updates</Label>
                <p className="text-sm text-muted-foreground">Notifications about team activity</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* Other Settings */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>More Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {settingsSections.map((section, index) => (
              <div key={section.title}>
                <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <section.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{section.title}</p>
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
                {index < settingsSections.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="shadow-card border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Export Data</p>
                <p className="text-sm text-muted-foreground">Download all your data</p>
              </div>
              <Button variant="outline">Export</Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Account</p>
                <p className="text-sm text-muted-foreground">Permanently delete your account and data</p>
              </div>
              <Button variant="destructive">Delete Account</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ManagerSettings;
