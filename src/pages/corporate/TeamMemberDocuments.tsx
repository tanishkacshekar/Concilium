import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Calendar,
  ListTodo,
  LayoutGrid,
  FileText,
  File,
  FileImage,
  FileVideo,
  Folder,
  Search,
  Upload,
  MoreHorizontal,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { SidebarItem } from "@/components/layout/Sidebar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  loadWorkspaceDocuments,
  saveWorkspaceDocuments,
  WorkspaceDocument,
} from "@/lib/workspaceStorage";
import { useParams } from "react-router-dom";

const typeIcons: Record<string, typeof FileText> = {
  doc: FileText,
  ppt: FileImage,
  video: FileVideo,
  folder: Folder,
  default: File,
};

const TeamMemberDocuments = () => {
  const { workspaceId = "alpha" } = useParams();
  const basePath = `/business/member/workspaces/${workspaceId}`;
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<WorkspaceDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadType, setUploadType] = useState("doc");

  useEffect(() => {
    setDocuments(loadWorkspaceDocuments(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (documents.length > 0) {
      saveWorkspaceDocuments(workspaceId, documents);
    }
  }, [documents, workspaceId]);

  const handleDocumentClick = (doc: WorkspaceDocument) => {
    setSelectedDoc(doc);
  };

  const handleUpload = () => {
    if (!uploadName.trim()) return;
    const newDoc: WorkspaceDocument = {
      id: `doc-${Date.now()}`,
      name: uploadName.trim(),
      type: uploadType,
      size: "0 KB",
      modified: "Just now",
    };
    setDocuments((prev) => [newDoc, ...prev]);
    setUploadName("");
    setUploadType("doc");
    setUploadOpen(false);
  };

  const teamMemberSidebarItems: SidebarItem[] = [
    { title: "Dashboard", href: `${basePath}/dashboard`, icon: LayoutDashboard },
    { title: "Meetings", href: `${basePath}/meetings`, icon: Calendar, badge: 2 },
    { title: "My Tasks", href: `${basePath}/tasks`, icon: ListTodo, badge: 3 },
    { title: "Kanban", href: `${basePath}/kanban`, icon: LayoutGrid },
    { title: "Documents", href: `${basePath}/documents`, icon: FileText },
  ];

  return (
    <DashboardLayout
      sidebarItems={teamMemberSidebarItems}
      sidebarTitle="Team Member"
      sidebarSubtitle="Personal Workspace"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Documents</h1>
            <p className="text-muted-foreground">
              Shared documents and meeting recordings
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents..." className="pl-10" />
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Recent Documents</CardTitle>
            <CardDescription>
              Documents from meetings and shared by team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documents.map((doc) => {
                const Icon = typeIcons[doc.type] || typeIcons.default;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleDocumentClick(doc)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.size} • Modified {doc.modified}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="uppercase text-xs">
                        {doc.type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDocumentClick(doc);
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDoc?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedDoc && (
                <span>
                  {selectedDoc.type.toUpperCase()} • {selectedDoc.size} • Modified{" "}
                  {selectedDoc.modified}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedDoc && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Document preview. In a full implementation, this would display
                  the document content or open it in a new tab.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    if (selectedDoc.url) {
                      window.open(selectedDoc.url, "_blank");
                    } else {
                      window.open(`#document-${selectedDoc.id}`, "_blank");
                    }
                    setSelectedDoc(null);
                  }}
                >
                  Open in new tab
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Add a new document to the workspace. Enter the document name and type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-name">Document Name</Label>
              <Input
                id="doc-name"
                placeholder="e.g. Meeting Notes - Jan 15"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-type">Type</Label>
              <Input
                id="doc-type"
                placeholder="doc, ppt, video, etc."
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!uploadName.trim()}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default TeamMemberDocuments;
