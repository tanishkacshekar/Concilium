import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronDown, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/context/AuthContext';

interface TopBarProps {
  showMeetingStatus?: boolean;
  liveMeetingTitle?: string | null;
}

const roleLabel = (role: string) => {
  const cleaned = (role || "").trim();
  if (!cleaned) return "Member";
  return cleaned;
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const TopBar = ({ showMeetingStatus = true, liveMeetingTitle = null }: TopBarProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const clock = useClock();
  const displayName = user?.name ?? "";
  const displayRole = user ? roleLabel(user.role) : "";
  const displayAvatar = user?.avatar ?? undefined;
  const notifications: { id: string; title: string; message: string; isRead: boolean }[] = [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const timeStr = clock.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      {/* Left side - Search */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings, tasks, projects..."
            className="pl-10 bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* Center - Real clock; live meeting only when one exists */}
      {showMeetingStatus && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium tabular-nums">{timeStr}</p>
            <p className="text-xs text-muted-foreground">{dateStr}</p>
          </div>
          {liveMeetingTitle && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              <span className="text-sm font-medium truncate max-w-[140px]">{liveMeetingTitle}</span>
            </div>
          )}
        </div>
      )}

      {/* Right side - Actions */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-popover">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                No notifications
              </DropdownMenuItem>
            ) : (
              notifications.slice(0, 4).map((notification) => (
                <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-1 p-3">
                  <div className="flex items-center gap-2 w-full">
                    <span className="font-medium text-sm">{notification.title}</span>
                    {!notification.isRead && (
                      <span className="h-2 w-2 rounded-full bg-primary ml-auto" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{notification.message}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center justify-center text-primary">
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={displayAvatar} alt={displayName} />
                <AvatarFallback>{displayName.split(' ').map(n => n[0]).join('') || 'U'}</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{displayName}</span>
                <span className="text-xs text-muted-foreground">{displayRole}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive flex items-center gap-2"
              onClick={() => {
                logout();
                navigate('/auth');
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;
