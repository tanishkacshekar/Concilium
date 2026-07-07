/**
 * No sample data - all data comes from API or user context.
 * Empty exports for backwards compatibility; replace with API calls where needed.
 */
import type {
  TeamMember,
  Meeting,
  Task,
  Notification,
  KanbanColumn,
  TeamAnalytics,
  WeeklyProgress,
  Class,
  Lecture,
  Assignment,
} from "@/lib/types";

export const mockTeamMembers: TeamMember[] = [];
export const mockMeetings: Meeting[] = [];
export const mockTasks: Task[] = [];
export const mockNotifications: Notification[] = [];
export const mockWeeklyProgress: WeeklyProgress[] = [];
export const mockTeamAnalytics: TeamAnalytics = {
  teamScore: 0,
  trend: "stable",
  memberMetrics: [],
  weeklyProgress: [],
};
export const mockKanbanColumns: KanbanColumn[] = [
  { id: "todo", title: "To Do", tasks: [] },
  { id: "in_progress", title: "In Progress", tasks: [] },
  { id: "in_review", title: "In Review", tasks: [] },
  { id: "done", title: "Done", tasks: [] },
  { id: "blockers", title: "Blockers", tasks: [] },
];
export const mockClasses: Class[] = [];
export const mockLectures: Lecture[] = [];
export const mockAssignments: Assignment[] = [];

export const getTaskStats = () => ({
  total: 0,
  todo: 0,
  inProgress: 0,
  review: 0,
  done: 0,
  blocked: 0,
  overdue: 0,
});
