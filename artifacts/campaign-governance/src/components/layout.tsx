import * as React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FolderKanban, 
  ClipboardCheck, 
  Tags, 
  BarChart4, 
  Plus,
  ShieldCheck,
  LogIn,
  LogOut,
  CalendarDays
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const NAV_GROUPS = [
  {
    title: "Planning",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
    ]
  },
  {
    title: "Governance",
    items: [
      { href: "/taxonomy", label: "Taxonomy", icon: Tags },
      { href: "/finance/calendars", label: "Fiscal Calendars", icon: CalendarDays },
    ]
  },
  {
    title: "Intelligence",
    items: [
      { href: "/reporting", label: "Reporting", icon: BarChart4 },
    ]
  }
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isLoading: isAuthLoading, login, logout } = useAuth();
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((part) => part![0])
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar">
        <div className="flex h-16 items-center border-b border-border/50 px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-primary transition-opacity hover:opacity-80">
            <ShieldCheck className="h-6 w-6" />
            <span className="text-lg tracking-tight">GovCenter</span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-auto py-6 flex flex-col gap-6 px-4">
          <div className="px-2">
            <Button asChild className="w-full justify-start gap-2 shadow-sm font-medium" size="lg">
              <Link href="/create-campaign">
                <Plus className="h-5 w-5" />
                New Campaign
              </Link>
            </Button>
          </div>
          
          <div className="flex flex-col gap-6">
            {NAV_GROUPS.map((group) => (
              <nav key={group.title} className="flex flex-col gap-1">
                <h4 className="px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {group.title}
                </h4>
                {group.items.map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                          isActive 
                            ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20" 
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            ))}
          </div>
        </div>
        
        <div className="border-t border-border/50 p-4 bg-sidebar/50">
          {isAuthLoading ? (
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
              <div className="h-8 w-8 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <span className="text-xs font-bold">{initials}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Signed-in user"}
                </span>
                <span className="truncate text-[10px] text-muted-foreground font-mono">{user.email}</span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={logout} aria-label="Log out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full justify-start gap-2 shadow-sm" onClick={login}>
              <LogIn className="h-4 w-4" />
              Log in securely
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-muted/20">
        {/* Mobile Header */}
        <header className="flex md:hidden h-14 items-center justify-between border-b bg-background px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span>GovCenter</span>
          </Link>
          <Button asChild size="icon" variant="default" className="h-8 w-8 rounded-full shadow-sm">
            <Link href="/create-campaign">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10">
          <div className="mx-auto max-w-6xl h-full">
            {children}
          </div>
        </div>
        
        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex items-center justify-around border-t bg-background pb-safe h-16">
          {NAV_GROUPS.flatMap(g => g.items).slice(0, 5).map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full gap-1 p-2",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
