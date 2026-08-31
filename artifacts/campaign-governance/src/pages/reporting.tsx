import { useGetCampaignReportingDimensions } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Reporting() {
  const { data, isLoading, error } = useGetCampaignReportingDimensions();
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Reporting &amp; Exports
        </h1>
        <p className="text-sm text-muted-foreground">
          Analyze campaign performance and governance compliance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Audience dimensions</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Segments, personas, functions, geography, language, and journey stage remain separate rows.</p><Badge>{data?.audience.length ?? 0} selections</Badge></CardContent></Card>
        <Card><CardHeader><CardTitle>Product roles</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Each product appears once with one explicit role and remains independent from audience rows.</p><Badge>{data?.products.length ?? 0} products</Badge></CardContent></Card>
        <Card><CardHeader><CardTitle>Exact cohort treatments</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">The selected effective treatment ID and version are retained for reproducible reporting.</p><Badge>{data?.cohorts.length ?? 0} treatments</Badge></CardContent></Card>
        <Card><CardHeader><CardTitle>Authoritative shared cost</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Each authoritative campaign cost is returned once and is never multiplied by audience or product joins.</p><Badge>{data?.authoritativeCosts.length ?? 0} cost records</Badge></CardContent></Card>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading governed dimensions…</p>}
      {error && <p className="text-sm text-destructive">Reporting data could not be loaded.</p>}
      {data && <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-4"><div><p className="text-2xl font-bold">{data.campaignCount}</p><p className="text-xs text-muted-foreground">Campaigns</p></div><div><p className="text-2xl font-bold">{data.warningCount}</p><p className="text-xs text-muted-foreground">Warnings</p></div><div><p className="text-2xl font-bold">{data.unresolvedCount}</p><p className="text-xs text-muted-foreground">Unresolved requests</p></div><div><p className="text-2xl font-bold">{data.cohorts.length}</p><p className="text-xs text-muted-foreground">Versioned cohorts</p></div></CardContent></Card>}
    </div>
  );
}