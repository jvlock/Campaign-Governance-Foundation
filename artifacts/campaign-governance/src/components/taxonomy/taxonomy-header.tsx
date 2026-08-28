import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Tags, GitPullRequest, FileDown, ShieldCheck } from "lucide-react";
import { useTaxonomyAccess } from "./taxonomy-guard";

const TABS = [
  { href: "/taxonomy", label: "Governed Values", icon: Tags },
  { href: "/taxonomy/review-requests", label: "Review Requests", icon: GitPullRequest, requirePropose: true },
  { href: "/taxonomy/imports", label: "Import Center", icon: FileDown, requireAdmin: true },
];

export function TaxonomyHeader() {
  const [location] = useLocation();
  const access = useTaxonomyAccess();

  const visibleTabs = TABS.filter(tab => {
    if (tab.requireAdmin && !access.canAdminister) return false;
    if (tab.requirePropose && !access.canPropose) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 mb-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          Governance Workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Enterprise marketing taxonomy administration and stewardship.
        </p>
      </div>

      <div className="flex bg-muted/50 p-1 rounded-lg border overflow-x-auto w-fit">
        {visibleTabs.map((tab) => {
          const isActive = location === tab.href || (tab.href !== "/taxonomy" && location.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href}>
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                  isActive 
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
