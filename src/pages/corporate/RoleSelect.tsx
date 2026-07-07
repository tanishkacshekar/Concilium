import { Link } from 'react-router-dom';
import { 
  Users, 
  User, 
  ArrowLeft,
  TrendingUp,
  LayoutDashboard,
  CheckCircle2,
  BarChart3,
  ListTodo,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const CorporateRoleSelect = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-6">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Business Dashboard
            </h1>
            <p className="text-muted-foreground text-lg">
              Select your role to access your personalized workspace
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Manager Card */}
            <Link to="/business/manager/workspaces" className="group">
              <Card className="h-full shadow-card hover:shadow-hover transition-all duration-300 border-2 border-transparent hover:border-primary/20">
                <CardHeader>
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Users className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Manager</CardTitle>
                  <CardDescription>
                    Lead your team with AI-powered insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                    <li className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Team productivity analytics
                    </li>
                    <li className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Performance tracking
                    </li>
                    <li className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-primary" />
                      Auto-managed Kanban
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Task delegation & oversight
                    </li>
                  </ul>
                  <Button className="w-full">
                    Continue as Manager
                  </Button>
                </CardContent>
              </Card>
            </Link>

            {/* Team Member Card */}
            <Link to="/business/member/workspaces" className="group">
              <Card className="h-full shadow-card hover:shadow-hover transition-all duration-300 border-2 border-transparent hover:border-secondary/20">
                <CardHeader>
                  <div className="h-14 w-14 rounded-xl bg-secondary/10 flex items-center justify-center mb-4 group-hover:bg-secondary/20 transition-colors">
                    <User className="h-7 w-7 text-secondary" />
                  </div>
                  <CardTitle className="text-xl">Team Member</CardTitle>
                  <CardDescription>
                    Focus on execution with clear priorities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                    <li className="flex items-center gap-2">
                      <ListTodo className="h-4 w-4 text-secondary" />
                      Personal task dashboard
                    </li>
                    <li className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-secondary" />
                      Meeting notes & summaries
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-secondary" />
                      Progress tracking
                    </li>
                    <li className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-secondary" />
                      Real-time Kanban updates
                    </li>
                  </ul>
                  <Button variant="secondary" className="w-full">
                    Continue as Team Member
                  </Button>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CorporateRoleSelect;
