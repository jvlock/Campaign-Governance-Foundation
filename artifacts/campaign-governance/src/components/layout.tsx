import * as React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FolderKanban, 
  ClipboardCheck, 
  Tags, 
  BarChart4, 
  Plus,
  ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/taxonomy", label: "Taxonomy", icon: Tags },
  { href: "/reporting", label: "Reporting", icon: BarChart4 },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center border-b px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sidebar-foreground transition-opacity hover:opacity-80">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span>GovCenter</span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-auto py-6 flex flex-col gap-6 px-4">
          <div className="px-2">
            <Link href="/create-campaign">
              <Button className="w-full justify-start gap-2 shadow-sm" variant="default">
                <Plus className="h-4 w-4" />
                New Campaign
              </Button>
            </Link>
          </div>
          
          <nav className="flex flex-col gap-1">
            <h4 className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Foundation
            </h4>
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
                      isActive 
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" 
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="border-t p-4">
          <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary">JD</span>
            </div>
            <div className="flex flex-col">
              <span className="text-foreground text-xs font-semibold leading-none">Jane Doe</span>
              <span className="text-[10px] leading-tight mt-0.5">Gov Admin</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="flex md:hidden h-14 items-center justify-between border-b bg-background px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span>GovCenter</span>
          </Link>
          <Link href="/create-campaign">
            <Button size="icon" variant="default" className="h-8 w-8 rounded-full">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
        
        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex items-center justify-around border-t bg-background pb-safe h-16">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
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