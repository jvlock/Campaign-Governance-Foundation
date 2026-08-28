import { 
  useHealthCheck, 
  useGetFoundationSummary, 
  useListFoundationActivity 
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  Activity, 
  Server, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2,
  ListTree,
  Scale
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: health, isLoading: isLoadingHealth } = useHealthCheck();
  const { data: summary, isLoading: isLoadingSummary } = useGetFoundationSummary();
  const { data: activities, isLoading: isLoadingActivity } = useListFoundationActivity();

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Foundation Readiness
          </h1>
          <p className="text-sm text-muted-foreground">
            Governance control center and segment-led active values.
          </p>
        </div>
        
        {/* Global Health Badge */}
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 shadow-sm">
          {isLoadingHealth ? (
            <Skeleton className="h-4 w-24" />
          ) : health ? (
            <>
              <div className={cn(
                "h-2 w-2 rounded-full",
                health.status === 'ok' ? "bg-emerald-500" : "bg-amber-500"
              )} />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sys: {health.status}
              </span>
            </>
          ) : (
            <span className="text-xs text-destructive font-medium">Health unknown</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Phase Card */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Phase
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-3/4" />
            ) : summary ? (
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold capitalize">{summary.phase}</span>
                <span className="text-xs text-muted-foreground">Taxonomy: v{summary.taxonomyVersion}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Failed to load summary</div>
            )}
          </CardContent>
        </Card>

        {/* Governed Values Summary */}
        <Card className="shadow-sm md:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Governed Taxonomy Values
            </CardTitle>
            <ListTree className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="flex gap-4 mt-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            ) : summary ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-1">
                {Object.entries(summary.governedValues).map(([key, count]) => (
                  <div key={key} className="flex flex-col gap-1 border-l-2 pl-3 py-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {key}
                    </span>
                    <span className="text-xl font-bold font-mono">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Unavailable</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Core Principles */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <CardTitle>Core Principles</CardTitle>
            </div>
            <CardDescription>
              Guiding directives for campaign architecture.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoadingSummary ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : summary ? (
              <ul className="space-y-4">
                {summary.principles.map((principle, idx) => (
                  <li key={idx} className="flex gap-3 items-start bg-muted/30 p-3 rounded-md border">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 font-medium">
                      {principle}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {/* System Readiness */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              <CardTitle>System Infrastructure</CardTitle>
            </div>
            <CardDescription>
              Technical foundation status.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoadingSummary ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : summary ? (
              <div className="space-y-3">
                {Object.entries(summary.readiness).map(([component, status]) => (
                  <div key={component} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      {status === 'complete' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="text-sm font-medium capitalize">
                        {component.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </div>
                    <Badge variant={status === 'complete' ? 'default' : 'secondary'} className="capitalize shadow-none">
                      {status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Governance Log</CardTitle>
          </div>
          <CardDescription>
            Recent foundation decisions and evidence entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingActivity ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : activities && activities.length > 0 ? (
            <div className="relative border-l ml-3 pl-6 space-y-6">
              {activities.map((activity) => (
                <div key={activity.id} className="relative">
                  <div className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full bg-background border-2 border-primary" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{activity.title}</span>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 uppercase bg-muted/50 border-muted">
                        {activity.kind}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.detail}
                    </p>
                    <time className="text-xs text-muted-foreground/70 font-mono mt-1">
                      {format(new Date(activity.recordedAt), "MMM d, yyyy HH:mm 'UTC'")}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
              No recent governance activity.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}