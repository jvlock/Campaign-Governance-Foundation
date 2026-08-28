import { FolderSearch, Plus, Search, Calendar, Activity, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { useListCampaigns } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { format } from "date-fns";

export default function Campaigns() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data: campaigns, isLoading } = useListCampaigns({
    search: search || undefined,
    status: status !== "all" ? status : undefined,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "approved":
        return <Badge variant="default" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case "draft":
        return <Badge variant="secondary" className="bg-secondary text-secondary-foreground"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
      case "submitted":
        return <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-50/50"><Activity className="w-3 h-3 mr-1" /> In Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Campaign Registry
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl">
            Governed command center for enduring campaigns. Manage persistent identities, budgets, and audiences without spreadsheet ambiguity.
          </p>
        </div>
        <Link href="/create-campaign">
          <Button className="gap-2 shadow-sm shadow-primary/20">
            <Plus className="h-4 w-4" />
            Initialize Campaign
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-1 md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by campaign name or master UTM key..." 
            className="pl-9 bg-card shadow-sm h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-span-1">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-card shadow-sm h-11">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border bg-card animate-pulse">
              <CardContent className="h-24 p-6" />
            </Card>
          ))}
        </div>
      ) : !campaigns?.length ? (
        <Card className="border bg-card border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center min-h-[400px]">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
              <FolderSearch className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-bold tracking-tight">
              No campaigns found
            </h2>
            <p className="mb-8 max-w-md text-sm text-muted-foreground">
              {search || status !== 'all' 
                ? "Adjust your filters to see more results."
                : "The registry is ready. Initialize your first enduring campaign to begin multi-year planning."}
            </p>
            {!(search || status !== 'all') && (
              <Link href="/create-campaign">
                <Button className="shadow-sm">Initialize Campaign</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {campaigns.map((campaign) => (
            <Link key={campaign.campaignKey} href={`/campaigns/${campaign.campaignKey}`}>
              <Card className="border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group">
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg text-foreground truncate group-hover:text-primary transition-colors">
                        {campaign.name}
                      </h3>
                      {getStatusBadge(campaign.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground/80">
                        {campaign.campaignKey}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {campaign.startDate ? format(new Date(campaign.startDate), "MMM d, yyyy") : "TBD"} 
                        {" - "} 
                        {campaign.endDate ? format(new Date(campaign.endDate), "MMM d, yyyy") : (campaign.isEvergreen ? "Evergreen" : "TBD")}
                      </span>
                      <span className="capitalize text-muted-foreground/80 hidden sm:inline">
                        Type: {campaign.campaignType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex flex-col items-end hidden md:flex">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Owner</span>
                      <span className="font-medium text-foreground">{campaign.createdBy}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="group-hover:bg-primary/10 group-hover:text-primary shrink-0 -mr-2">
                      Manage Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
