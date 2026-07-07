import { Component, useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { businessRoutes } from "@/routes/businessRoutes";

// Pages
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function SessionRecoveryScreen() {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = "/auth";
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-6">
        <p className="text-muted-foreground">Something went wrong with your session. Redirecting you to sign in…</p>
        <a href="/auth" className="text-primary font-medium underline hover:no-underline">Go to login</a>
      </div>
    </div>
  );
}

class AuthErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; isAuthError: boolean }> {
  state = { hasError: false, isAuthError: false };
  static getDerivedStateFromError(_error: Error) {
    return {};
  }
  componentDidCatch(error: Error) {
    const msg = error?.message ?? "";
    const isAuthError =
      msg.includes("useAuth must be used within AuthProvider") ||
      msg.includes("useWorkspace must be used within a WorkspaceProvider");
    this.setState({ hasError: true, isAuthError });
  }
  render() {
    if (this.state.hasError) {
      return this.state.isAuthError ? (
        <SessionRecoveryScreen />
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 p-6 max-w-sm">
            <p className="text-muted-foreground">Something went wrong loading this page.</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <a href="/" className="text-primary font-medium underline hover:no-underline">Go to home</a>
              <span className="hidden sm:inline text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-primary font-medium underline hover:no-underline"
              >
                Refresh page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
      <WorkspaceProvider>
          <AuthErrorBoundary>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />

              {/* All routes below require login */}
              <Route element={<ProtectedRoute />}>
                <Route path="/profile" element={<Profile />} />
                {businessRoutes}

                {/* Legacy Redirects */}
                <Route path="/corporate" element={<Navigate to="/business" replace />} />
                <Route path="/corporate/manager" element={<Navigate to="/business/manager/workspaces" replace />} />
                <Route path="/corporate/manager/*" element={<Navigate to="/business/manager/workspaces" replace />} />
                <Route path="/corporate/team-member" element={<Navigate to="/business/member/workspaces" replace />} />
                <Route path="/corporate/team-member/*" element={<Navigate to="/business/member/workspaces" replace />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </AuthErrorBoundary>
      </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
