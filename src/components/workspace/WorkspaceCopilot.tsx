import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { postWorkspaceCopilotChat } from "@/lib/api";

type Msg = { role: "user" | "assistant"; text: string };

interface WorkspaceCopilotProps {
  token: string | null;
  workspaceId: string;
  /** When set (e.g. on meeting detail route), copilot includes this meeting’s transcript excerpt. */
  meetingId?: string;
}

/**
 * Floating workspace copilot: knows members, meetings, tasks; can create meetings/tasks and sync Kanban.
 */
const WorkspaceCopilot = ({ token, workspaceId, meetingId }: WorkspaceCopilotProps) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    const q = input.trim();
    if (!q || !token || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const { answer } = await postWorkspaceCopilotChat(token, workspaceId, q, meetingId || undefined);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: e instanceof Error ? e.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2 pointer-events-none">
      {open && (
        <div
          className={cn(
            "pointer-events-auto w-[min(100vw-2rem,400px)] rounded-xl border bg-card shadow-lg",
            "flex flex-col max-h-[min(72vh,560px)] overflow-hidden"
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2 bg-muted/40">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">Workspace copilot</p>
                <p className="text-xs text-muted-foreground truncate">
                  {meetingId ? "Includes this meeting’s transcript" : "Project-wide context"}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Ask about this workspace—meetings, tasks, who is doing what—or say things like: “Schedule a
                standup tomorrow”, “Add a task for the owner to review the deck”,                 “Mark task (paste task id) as done”, or “Refresh Kanban from meetings”. On a meeting page, I also use live context from
                that meeting.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 max-w-[95%]",
                  msg.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                Working…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form
            className="border-t p-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={token ? "Ask or command…" : "Sign in to use copilot"}
              disabled={!token || loading}
              className="text-sm"
            />
            <Button type="submit" size="icon" disabled={!token || loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
      <Button
        type="button"
        size="lg"
        className="pointer-events-auto h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close workspace copilot" : "Open workspace copilot"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>
    </div>
  );
};

export default WorkspaceCopilot;
