import { Link } from 'react-router-dom';
import {
  Building2,
  Mic,
  ListTodo,
  TrendingUp,
  CheckCircle2,
  Lock,
  Sparkles,
  ArrowRight,
  Play,
  Users,
  Clock,
  Zap,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';

const Landing = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation — Minimal, glass */}
      <nav className="sticky top-0 z-50 glass border-b border-white/20 dark:border-white/10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">MeetingAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
                      <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('') || 'U'}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline font-medium">{user.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => logout()}
                  >
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="outline">Sign In</Button>
                </Link>
                <Link to="/auth">
                  <Button>Sign Up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section — Center H1 + gradient text + 3D floating preview */}
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-2 rounded-full font-medium">
            <Sparkles className="h-3 w-3 mr-2" />
            AI-Powered Meeting Intelligence
          </Badge>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Every output derived{' '}
            <span className="gradient-text">only from what&apos;s spoken</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Transform your meetings into actionable insights. Automatic transcription,
            task extraction, and productivity tracking—all powered by AI.
          </p>

          {/* 3D floating transcription preview */}
          <div className="max-w-2xl mx-auto mb-14" style={{ perspective: '1000px' }}>
            <div className="rounded-premium-lg glass-card shadow-elevated hover:shadow-hover transition-all duration-300 hover-lift p-6 md:p-8 transform-gpu shadow-xl" style={{ transform: 'rotateX(2deg) rotateY(-2deg)' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="h-3 w-3 rounded-full bg-success animate-pulse" />
                <span className="text-sm font-medium text-muted-foreground">Live transcription</span>
              </div>
              <div className="text-left space-y-3 text-sm md:text-base text-foreground/90 font-medium">
                <p><span className="text-primary font-semibold">Speaker 1:</span> &quot;We should ship the dashboard by Friday.&quot;</p>
                <p><span className="text-secondary font-semibold">Speaker 2:</span> &quot;I&apos;ll own the API integration. Sarah, can you handle the front-end?&quot;</p>
                <p><span className="text-primary font-semibold">Speaker 1:</span> &quot;Done. I&apos;ll add it to the board.&quot;</p>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Tasks extracted: 2 · Assigned automatically
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="max-w-sm mx-auto">
            <Link to="/business" className="group block">
              <Button size="lg" className="w-full rounded-premium text-base h-12 group-hover:shadow-glow transition-shadow">
                Get Started for Business
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Bento Grid Features — Auto Task Extraction + Team Analytics */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything extracted from meetings
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No manual input required. Our AI listens, understands, and acts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 md:grid-rows-2 gap-4 max-w-5xl mx-auto">
            {/* Auto Task Extraction — large tile */}
            <div className="md:col-span-4 md:row-span-2 rounded-premium-lg bg-card border shadow-card hover:shadow-elevated hover-lift transition-all duration-300 overflow-hidden p-6 md:p-8 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                  <ListTodo className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold mb-3">Auto Task Extraction</h3>
                <p className="text-muted-foreground text-sm md:text-base max-w-md">
                  AI identifies action items, assigns owners, and sets deadlines automatically—no manual entry.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full">Assignees</Badge>
                <Badge variant="secondary" className="rounded-full">Due dates</Badge>
                <Badge variant="secondary" className="rounded-full">Priority</Badge>
              </div>
            </div>

            {/* Team Analytics — top right */}
            <div className="md:col-span-2 rounded-premium-lg bg-card border shadow-card hover:shadow-elevated hover-lift transition-all duration-300 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <h3 className="text-lg font-bold mb-2">Team Analytics</h3>
              <p className="text-muted-foreground text-sm">
                Track productivity, completion rates, and bottlenecks across the team.
              </p>
            </div>

            {/* Live Transcription — bottom right */}
            <div className="md:col-span-2 rounded-premium-lg bg-card border shadow-card hover:shadow-elevated hover-lift transition-all duration-300 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div className="h-12 w-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                <Mic className="h-6 w-6 text-secondary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Live Transcription</h3>
              <p className="text-muted-foreground text-sm">
                Real-time speech-to-text with speaker detection.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-muted-foreground text-lg">Three simple steps to transform your meetings</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Start or Upload</h3>
              <p className="text-muted-foreground">
                Begin a live meeting with our AI or upload a recording for analysis.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">AI Processes</h3>
              <p className="text-muted-foreground">
                Our AI transcribes, summarizes, and extracts all action items automatically.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Take Action</h3>
              <p className="text-muted-foreground">
                Tasks appear in your dashboard, Kanban updates, and deadlines are tracked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section id="testimonials" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Trusted by teams everywhere</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="shadow-card border-0">
              <CardContent className="pt-6">
                <p className="text-muted-foreground mb-6">
                  "Finally, a tool that actually captures what matters in meetings. My team's productivity jumped 40%."
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Sarah Chen</p>
                    <p className="text-xs text-muted-foreground">Product Manager, TechCorp</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="pt-6">
                <p className="text-muted-foreground mb-6">
                  "The auto-updated Kanban board is a game changer. No more status update meetings!"
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Emily Rodriguez</p>
                    <p className="text-xs text-muted-foreground">Engineering Lead, StartupXYZ</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg">Start free, upgrade when you need more</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <Card className="shadow-card rounded-premium hover-lift">
              <CardHeader>
                <CardTitle className="text-2xl">Free</CardTitle>
                <CardDescription>Perfect for getting started</CardDescription>
                <div className="pt-4">
                  <span className="text-4xl font-bold">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Up to 5 meetings/month</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>AI transcription & summaries</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Basic task extraction</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Personal Kanban board</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <Lock className="h-5 w-5 flex-shrink-0" />
                    <span>Team analytics</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <Lock className="h-5 w-5 flex-shrink-0" />
                    <span>AI coaching chatbot</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full">Get Started Free</Button>
              </CardContent>
            </Card>

            {/* Pro Tier — Most Popular glowing border */}
            <Card className="shadow-card relative overflow-hidden rounded-premium border-2 border-primary/30 shadow-glow ring-2 ring-primary/20">
              <div className="absolute top-0 right-0 px-4 py-1.5 gradient-premium text-premium-foreground text-sm font-semibold rounded-bl-premium">
                Most Popular
              </div>
              <CardHeader>
                <CardTitle className="text-2xl">Pro</CardTitle>
                <CardDescription>For teams that want more</CardDescription>
                <div className="pt-4">
                  <span className="text-4xl font-bold">$19</span>
                  <span className="text-muted-foreground">/user/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Unlimited meetings</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Everything in Free</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-premium flex-shrink-0" />
                    <span className="flex items-center gap-2">
                      Team productivity analytics
                      <Badge className="gradient-premium text-premium-foreground text-xs">Pro</Badge>
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-premium flex-shrink-0" />
                    <span className="flex items-center gap-2">
                      AI coaching chatbot
                      <Badge className="gradient-premium text-premium-foreground text-xs">Pro</Badge>
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-premium flex-shrink-0" />
                    <span className="flex items-center gap-2">
                      Advanced moderation insights
                      <Badge className="gradient-premium text-premium-foreground text-xs">Pro</Badge>
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-premium flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                </ul>
                <Button className="w-full gradient-primary hover:opacity-90">
                  Start Free Trial
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to transform your meetings?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Join thousands of teams already using MeetingAI to save time and boost productivity.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="gradient-primary hover:opacity-90">
              <Play className="h-5 w-5 mr-2" />
              Get Started Free
            </Button>
            <Button size="lg" variant="outline">
              <Clock className="h-5 w-5 mr-2" />
              Book a Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">MeetingAI</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © 2025 MeetingAI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
