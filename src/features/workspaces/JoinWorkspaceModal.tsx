import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/context/WorkspaceContext";

const JoinWorkspaceModal = () => {
  const { joinWorkspace } = useWorkspace();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || loading) return;
    setError("");
    setLoading(true);
    try {
      await joinWorkspace(code.trim());
      setCode("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite code not found or invalid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <KeyRound className="h-4 w-4 mr-2" />
          Join Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a project</DialogTitle>
          <DialogDescription>
            Enter an invite code shared by your manager.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Invite code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={handleJoin} disabled={!code.trim() || loading}>
            {loading ? "Joining…" : "Join Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinWorkspaceModal;
