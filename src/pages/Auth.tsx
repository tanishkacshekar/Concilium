import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-1"
  );
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, register, isAuthenticated } = useAuth();
  const avatarOptions = [
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-1",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-2",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-3",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-4",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-5",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=avatar-6",
  ];

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate('/business', { replace: true });
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.querySelector('#signin-email') as HTMLInputElement)?.value?.trim();
    const password = (form.querySelector('#signin-password') as HTMLInputElement)?.value;
    if (!email || !password) return;
    setIsLoading(true);
    try {
      await login(email, password);
      toast({ title: "Welcome back!", description: "You have successfully signed in." });
      // Navigation happens in useEffect when isAuthenticated becomes true (avoids race with state update)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: err instanceof Error ? err.message : "Invalid email or password.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.querySelector('#signup-name') as HTMLInputElement)?.value?.trim();
    const email = (form.querySelector('#signup-email') as HTMLInputElement)?.value?.trim();
    const password = (form.querySelector('#signup-password') as HTMLInputElement)?.value;
    const role = (form.querySelector('#signup-role') as HTMLInputElement)?.value?.trim();
    const skillsRaw = (form.querySelector('#signup-skills') as HTMLInputElement)?.value ?? '';
    const skills = skillsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const avatar = selectedAvatar;
    if (!name || !email || !password || !role) return;
    setIsLoading(true);
    try {
      await register({ name, email, password, role, skills, avatar });
      toast({ title: "Account created!", description: "Welcome. Your profile has been saved." });
      // Navigation happens in useEffect when isAuthenticated becomes true
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: err instanceof Error ? err.message : "Could not create account.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">MeetingAI</span>
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to MeetingAI</CardTitle>
            <CardDescription>
              Sign in to your account or create a new one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signin-email" type="email" placeholder="you@example.com" className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signin-password" type="password" placeholder="••••••••" className="pl-10" required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signup-name" type="text" placeholder="John Doe" className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signup-email" type="email" placeholder="you@example.com" className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signup-password" type="password" placeholder="••••••••" className="pl-10" required minLength={6} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-role">Role</Label>
                    <Input
                      id="signup-role"
                      type="text"
                      list="signup-role-suggestions"
                      placeholder="Frontend Dev, QA Engineer, DevOps, Testing..."
                      required
                    />
                    <datalist id="signup-role-suggestions">
                      <option value="Frontend Developer" />
                      <option value="Backend Developer" />
                      <option value="Full Stack Developer" />
                      <option value="QA Engineer" />
                      <option value="DevOps Engineer" />
                      <option value="Tester" />
                      <option value="Product Manager" />
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-skills">Skills (comma separated)</Label>
                    <Input id="signup-skills" type="text" placeholder="React, Python, Analytics" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-avatar">Avatar</Label>
                    <div id="signup-avatar" className="grid grid-cols-6 gap-2">
                      {avatarOptions.map((avatarUrl) => (
                        <button
                          key={avatarUrl}
                          type="button"
                          onClick={() => setSelectedAvatar(avatarUrl)}
                          className={`rounded-full p-0.5 border transition ${
                            selectedAvatar === avatarUrl
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-border hover:border-primary/50"
                          }`}
                          aria-label="Select avatar"
                        >
                          <img
                            src={avatarUrl}
                            alt="Avatar option"
                            className="h-10 w-10 rounded-full bg-muted"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Account'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    By signing up, you agree to our <a href="#" className="hover:text-primary">Terms</a> and <a href="#" className="hover:text-primary">Privacy Policy</a>
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
