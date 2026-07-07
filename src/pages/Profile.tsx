import { Mail, User, Shield, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";

const Profile = () => {
  const { user } = useAuth();

  if (!user) return null;

  const roleLabel = (user.role || "").trim() || "Member";

  return (
    <div className="container max-w-2xl py-8 px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
              <AvatarFallback className="text-xl">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{user.name}</CardTitle>
              <CardDescription>Your profile details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <User className="h-5 w-5" />
            <span className="font-medium text-foreground">Name</span>
            <span className="ml-auto">{user.name}</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Mail className="h-5 w-5" />
            <span className="font-medium text-foreground">Email</span>
            <span className="ml-auto">{user.email}</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Shield className="h-5 w-5" />
            <span className="font-medium text-foreground">Role</span>
            <span className="ml-auto capitalize">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Calendar className="h-5 w-5" />
            <span className="font-medium text-foreground">Member since</span>
            <span className="ml-auto">
              {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
