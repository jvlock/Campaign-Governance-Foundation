import { useState } from "react";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { 
  useGetCampaign, 
  useSubmitCampaign,
  getGetCampaignQueryKey,
  getListCampaignsQueryKey,
  useReplaceCampaignAudiences,
  useReplaceCampaignProducts,
  useSetCampaignBudget,
  useGenerateCampaignPlanningPeriods,
  useUpdateCampaignPlanningPeriod,
  useCloseCampaignPlanningPeriod,
  useReopenCampaignPlanningPeriod,
  useCreateCampaignActivity,
  useUpdateCampaignActivity,
  useAllocateActivityAcrossPeriods,
  useCreateCampaignCost,
  useUpdateCampaignCost,
  useReplaceCampaignCostDimensions,
  useListGovernedValues,
  useListFiscalCalendars,
  type CampaignDetail,
  type CampaignActivityDetail,
  type CampaignCostDetail,
  type CampaignPlanningPeriod
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { 
  ShieldCheck, Settings2, Users, Package, Wallet, Activity, History,
  AlertTriangle, CheckCircle2, Clock, Plus, Loader2, FileText, Save, Banknote, Edit3
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ManageConfigurationsDialog } from "@/components/activities/ManageConfigurationsDialog";
import { ManageDeliveryPlatformsDialog } from "@/components/activities/ManageDeliveryPlatformsDialog";
import { CreateActivityDialog } from "@/components/activities/CreateActivityDialog";
import { ActivityList } from "@/components/activities/ActivityList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatMinorUnitsToCurrency, parseDecimalToMinorUnits, sumMinorUnits, subtractMinorUnits } from "@/lib/utils";

const BUDGETING_VISIBLE = false;
const CAMPAIGN_SUBMISSION_VISIBLE = false;
const FINANCE_TERMS = /\b(budget|cost|fiscal|financial|allocation|spend|variance|forecast|committed|actual|funding)\b/i;

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const campaignId = params?.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaign, isLoading, isError } = useGetCampaign(campaignId, {
    query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) }
  });

  const submitCampaign = useSubmitCampaign();
  
  const handleSubmit = async () => {
    try {
      await submitCampaign.mutateAsync({
        campaignKey: campaignId,
        data: { reason: "Submitting for review" }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      toast({ title: "Campaign submitted for review" });
    } catch (e: any) {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    }
  };

  // -------------------------------------------------------------
  // MUTATIONS & STATE FOR DIALOGS
  // -------------------------------------------------------------
  const [audiencesOpen, setAudiencesOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

  const replaceAudiences = useReplaceCampaignAudiences();
  const replaceProducts = useReplaceCampaignProducts();
  const setBudget = useSetCampaignBudget();
  const generatePeriods = useGenerateCampaignPlanningPeriods();
  const createCost = useCreateCampaignCost();

  // Queries for governed values
  const { data: segments } = useListGovernedValues({ category: "segment" });
  const { data: products } = useListGovernedValues({ category: "product" });
  const { data: calendars } = useListFiscalCalendars();
  
  const primaryCalendar = calendars?.[0];

  const [selectedSegment, setSelectedSegment] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");

  const handleAddAudience = async () => {
    try {
      await replaceAudiences.mutateAsync({
        campaignKey: campaignId,
        data: { selections: [{ dimension: "segment_family", governedValueId: selectedSegment, isPrimary: true }] }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setAudiencesOpen(false);
      toast({ title: "Audiences updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAddProduct = async () => {
    try {
      await replaceProducts.mutateAsync({
        campaignKey: campaignId,
        data: { associations: [{ productValueId: selectedProduct, role: "primary_solution", isPrimary: true }] }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setProductsOpen(false);
      toast({ title: "Products updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const [reqAmount, setReqAmount] = useState("");
  const handleUpdateBudget = async () => {
    try {
      if (!primaryCalendar?.activeSnapshotId) {
        throw new Error("No active fiscal calendar snapshot available.");
      }
      await setBudget.mutateAsync({
        campaignKey: campaignId,
        data: {
          fiscalCalendarSnapshotId: primaryCalendar.activeSnapshotId,
          requestedMinor: parseDecimalToMinorUnits(reqAmount),
          approvedMinor: parseDecimalToMinorUnits(reqAmount),
          currency: "USD",
          currencyMinorUnits: 2,
          budgetOwner: "CurrentUser",
          costCenter: "CC-100",
          fundingSource: "Marketing",
          allocationMethod: "even"
        }
      });
      await generatePeriods.mutateAsync({
        campaignKey: campaignId,
        data: { method: "even" }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setBudgetOpen(false);
      toast({ title: "Budget & Periods generated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const [costDesc, setCostDesc] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const handleCreateCost = async () => {
    try {
      await createCost.mutateAsync({
        campaignKey: campaignId,
        data: {
          description: costDesc,
          authoritativeAmountMinor: parseDecimalToMinorUnits(costAmount),
          currency: "USD"
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setCostOpen(false);
      toast({ title: "Cost recorded" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };


  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-semibold tracking-wide uppercase">Resolving Campaign Identity...</p>
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="border-destructive/50 bg-destructive/5 max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-destructive">Identity Resolution Failed</CardTitle>
            <CardDescription className="text-destructive/80">
              The requested campaign key could not be found or you lack required governance permissions.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href="/campaigns">
              <Button variant="outline" className="border-destructive/20 text-destructive hover:bg-destructive/10">
                Return to Registry
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const visibleIssues = campaign.issueSummary.filter((issue) => !FINANCE_TERMS.test(issue));
  const visibleHistory = campaign.history?.filter((event) => !FINANCE_TERMS.test(`${event.action} ${event.reason || ""}`)) ?? [];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 h-full pb-10">
      <div className="flex flex-col gap-6 bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-mono tracking-wider font-bold">
                {campaign.campaignKey}
              </Badge>
              {getStatusBadge(campaign.status)}
              {campaign.isEvergreen && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Evergreen</Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-1">
              {campaign.name}
            </h1>
            <div className="flex items-center gap-6 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <span className="capitalize">{campaign.campaignType.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>
                  {campaign.startDate ? format(new Date(campaign.startDate), "MMM d, yyyy") : "TBD"} 
                  {" - "} 
                  {campaign.endDate ? format(new Date(campaign.endDate), "MMM d, yyyy") : (campaign.isEvergreen ? "Ongoing" : "TBD")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Owner: <span className="font-semibold text-foreground">{campaign.createdBy}</span></span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {CAMPAIGN_SUBMISSION_VISIBLE && campaign.status === 'draft' && (
              <Button 
                onClick={handleSubmit} 
                disabled={submitCampaign.isPending}
                className="shadow-sm shadow-primary/20 bg-primary hover:bg-primary/90 gap-2"
              >
                {submitCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Submit for Approval
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-auto p-0 gap-6">
          <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="audiences" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground">
            <Users className="w-4 h-4 mr-2 inline-block" />
            Audiences & Products
          </TabsTrigger>
          {BUDGETING_VISIBLE && (
            <TabsTrigger value="budget" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground">
              <Wallet className="w-4 h-4 mr-2 inline-block" />
              Financial Plan
            </TabsTrigger>
          )}
          <TabsTrigger value="activities" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground">
            <Activity className="w-4 h-4 mr-2 inline-block" />
            Activities & Executions
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground">
            <History className="w-4 h-4 mr-2 inline-block" />
            Audit History
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview" className="m-0 border-none p-0 outline-none">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <Card className="border shadow-sm">
                  <CardHeader className="bg-muted/10 border-b">
                    <CardTitle className="text-lg">Strategic Objective</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {campaign.objective || <span className="text-muted-foreground italic">No primary objective defined yet.</span>}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="border shadow-sm">
                  <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Readiness Assessment</CardTitle>
                    <Badge variant="outline" className={visibleIssues.length === 0 ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-amber-500 text-amber-600 bg-amber-50"}>
                      {visibleIssues.length === 0 ? "Naming & Tracking Ready" : `${visibleIssues.length} Governance Issues`}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {visibleIssues.length === 0 ? (
                      <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50/50 p-4 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium text-sm">Campaign identity, naming context, and tracking setup are ready.</span>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {visibleIssues.map((issue, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-amber-800 bg-amber-50/50 p-3 rounded-lg border border-amber-200 text-sm font-medium">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="border shadow-sm">
                  <CardHeader className="bg-muted/10 border-b">
                    <CardTitle className="text-lg">Plan Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex justify-between items-center py-2 border-b">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span className="text-sm font-medium">Governed Audiences</span>
                      </div>
                      <span className="font-bold">{campaign.audiences?.length || 0}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Package className="w-4 h-4" />
                        <span className="text-sm font-medium">Products</span>
                      </div>
                      <span className="font-bold">{campaign.products?.length || 0}</span>
                    </div>
                    {BUDGETING_VISIBLE && <div className="flex justify-between items-center py-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Wallet className="w-4 h-4" />
                        <span className="text-sm font-medium">Total Requested</span>
                      </div>
                      <span className="font-bold text-primary">
                        ${formatMinorUnitsToCurrency(campaign.planningPeriods?.reduce((acc, p) => sumMinorUnits(acc, p.requestedMinor), '0') || '0')}
                      </span>
                    </div>}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audiences" className="m-0 border-none p-0 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border shadow-sm flex flex-col">
                <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Audience Selections</CardTitle>
                    <CardDescription>Governed segments targeted</CardDescription>
                  </div>
                  <Dialog open={audiencesOpen} onOpenChange={setAudiencesOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 gap-1"><Plus className="w-3.5 h-3.5" /> Plan Audiences</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Replace Audiences</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <Label>Select Governed Segment</Label>
                        <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                          <SelectTrigger><SelectValue placeholder="Select segment..." /></SelectTrigger>
                          <SelectContent>
                            {segments?.map(s => <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAddAudience} disabled={replaceAudiences.isPending || !selectedSegment}>Save</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="pt-6 flex-1">
                  {!campaign.audiences || campaign.audiences.length === 0 ? (
                    <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No audiences planned" description="Map this campaign to governed taxonomy segments." />
                  ) : (
                    <div className="space-y-4">
                      {campaign.audiences.map((aud) => (
                        <div key={aud.id} className="flex flex-col gap-2 p-4 rounded-lg border bg-muted/5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold">{aud.dimension}</span>
                            {aud.isPrimary && <Badge variant="secondary" className="text-[10px] h-5">Primary Target</Badge>}
                          </div>
                          <span className="font-semibold text-sm">
                            {aud.unresolvedLabel || aud.governedValueId || 'Unknown Value'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border shadow-sm flex flex-col">
                <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Product Associations</CardTitle>
                    <CardDescription>Solutions driving this campaign</CardDescription>
                  </div>
                  <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 gap-1"><Plus className="w-3.5 h-3.5" /> Plan Products</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Replace Products</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <Label>Select Governed Product</Label>
                        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                          <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                          <SelectContent>
                            {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAddProduct} disabled={replaceProducts.isPending || !selectedProduct}>Save</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="pt-6 flex-1">
                  {!campaign.products || campaign.products.length === 0 ? (
                    <EmptyState icon={<Package className="w-8 h-8 text-muted-foreground" />} title="No products associated" description="Link governed products and specify their role." />
                  ) : (
                    <div className="space-y-4">
                      {campaign.products.map((prod) => (
                        <div key={prod.id} className="flex flex-col gap-2 p-4 rounded-lg border bg-muted/5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{prod.role.replace('_', ' ')}</span>
                            {prod.isPrimary && <Badge variant="secondary" className="text-[10px] h-5">Primary Focus</Badge>}
                          </div>
                          <span className="font-semibold text-sm">Product ID: {prod.productValueId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {BUDGETING_VISIBLE && <TabsContent value="budget" className="m-0 border-none p-0 outline-none">
            <Card className="border shadow-sm">
              <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Financial Planning Periods</CardTitle>
                  <CardDescription>Fiscal allocations bound to the master calendar</CardDescription>
                </div>
                <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 gap-1"><Wallet className="w-3.5 h-3.5" /> Update Budget</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Set Budget & Generate Periods</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                      <Label>Total Requested Amount (e.g. 1000.00)</Label>
                      <Input value={reqAmount} onChange={e => setReqAmount(e.target.value)} type="text" />
                    </div>
                    <DialogFooter>
                      <Button onClick={handleUpdateBudget} disabled={setBudget.isPending || generatePeriods.isPending || !reqAmount}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="pt-6">
                {!campaign.planningPeriods || campaign.planningPeriods.length === 0 ? (
                  <EmptyState icon={<Wallet className="w-8 h-8 text-muted-foreground" />} title="No financial periods initialized" description="Request budget allocation against the active fiscal calendar to begin financial planning." />
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wider font-bold text-muted-foreground border-b">
                        <tr>
                          <th className="px-4 py-3 font-medium">Period</th>
                          <th className="px-4 py-3 font-medium text-right">Approved</th>
                          <th className="px-4 py-3 font-medium text-right">Planned</th>
                          <th className="px-4 py-3 font-medium text-right">Committed</th>
                          <th className="px-4 py-3 font-medium text-right">Actual</th>
                          <th className="px-4 py-3 font-medium text-right">Remaining</th>
                          <th className="px-4 py-3 font-medium text-center">Status</th>
                          <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {campaign.planningPeriods.map(pp => (
                          <PlanningPeriodRow key={pp.id} period={pp} campaignId={campaignId} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>}

          <TabsContent value="activities" className="m-0 border-none p-0 outline-none">
             <div className="flex flex-col gap-8">
               <Card className="border shadow-sm flex flex-col w-full">
                 <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between shrink-0">
                   <div>
                     <CardTitle className="text-lg">Execution Activities</CardTitle>
                     <CardDescription>Configure channel activities and executions</CardDescription>
                   </div>
                   <div className="flex gap-2">
                     <ManageDeliveryPlatformsDialog />
                     <ManageConfigurationsDialog />
                     <CreateActivityDialog campaign={campaign} />
                   </div>
                 </CardHeader>
                 <CardContent className="p-0">
                   <ActivityList campaign={campaign} />
                 </CardContent>
               </Card>

              {BUDGETING_VISIBLE && <Card className="border shadow-sm flex flex-col w-full">
                <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between shrink-0">
                  <div>
                    <CardTitle className="text-lg">Authoritative Costs</CardTitle>
                    <CardDescription>Direct expenses incurred</CardDescription>
                  </div>
                  <Dialog open={costOpen} onOpenChange={setCostOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 gap-1"><Plus className="w-3.5 h-3.5" /> Log Cost</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Cost</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input value={costDesc} onChange={e => setCostDesc(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Amount</Label>
                          <Input value={costAmount} onChange={e => setCostAmount(e.target.value)} type="text" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateCost} disabled={createCost.isPending || !costDesc || !costAmount}>Save</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="pt-6 flex-1 flex flex-col overflow-auto">
                  {!campaign.costs || campaign.costs.length === 0 ? (
                    <div className="flex-1 flex"><EmptyState icon={<Banknote className="w-8 h-8 text-muted-foreground" />} title="No costs recorded" description="Record exact ledger expenses here." /></div>
                  ) : (
                    <div className="space-y-4 pb-4">
                      {campaign.costs.map(cost => (
                        <CostRow
                          key={cost.id}
                          cost={cost}
                          campaignId={campaignId}
                          products={campaign.products}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>}
             </div>
          </TabsContent>

          <TabsContent value="history" className="m-0 border-none p-0 outline-none">
            <Card className="border shadow-sm flex flex-col max-h-[600px]">
              <CardHeader className="bg-muted/10 border-b shrink-0">
                <CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Audit Log</CardTitle>
                <CardDescription>Immutable record of campaign governance and tracking transitions</CardDescription>
              </CardHeader>
              <ScrollArea className="flex-1">
                <CardContent className="pt-6">
                  {visibleHistory.length === 0 ? (
                    <EmptyState icon={<History className="w-8 h-8 text-muted-foreground" />} title="No audit history" description="Events will be recorded here automatically." />
                  ) : (
                    <div className="relative border-l-2 border-muted ml-4 space-y-8 pb-4">
                      {visibleHistory.map((event) => {
                        const isFinancial = false;
                        const snap = event.snapshot as Record<string, any> | undefined;
                        
                        return (
                          <div key={event.id} className="relative pl-6">
                            <div className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-background border-2 ring-4 ring-background ${isFinancial ? 'border-amber-500' : 'border-primary'}`} />
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold capitalize">{event.action.replace(/_/g, ' ')}</span>
                                {isFinancial && (
                                  <Badge variant="outline" className="text-[10px] uppercase h-5 text-amber-600 border-amber-600/30">Financial</Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{format(new Date(event.createdAt), "MMM d, yyyy 'at' h:mm a")} by {event.actorId}</span>
                              <div className="mt-2 p-3 bg-muted/30 rounded-md border text-left space-y-2">
                                <p className="text-sm text-foreground/80">{event.reason || "System event"}</p>
                                
                                {snap && Object.keys(snap).length > 0 && (
                                  <div className="pt-2 border-t border-border/50 mt-2 flex flex-wrap gap-2">
                                    {snap.varianceExplanation && (
                                      <div className="w-full text-xs bg-muted/50 p-2 rounded border border-border/50">
                                        <span className="font-semibold block mb-1">Variance Explanation:</span>
                                        {String(snap.varianceExplanation)}
                                      </div>
                                    )}
                                    {snap.approvedBy && (
                                      <Badge variant="secondary" className="font-mono text-xs">Approved By: {String(snap.approvedBy)}</Badge>
                                    )}
                                    {snap.unusedBudgetTreatment && (
                                      <Badge variant="secondary" className="font-mono text-xs">Treatment: {String(snap.unusedBudgetTreatment)}</Badge>
                                    )}
                                    {snap.plannedMinor !== undefined && (
                                      <Badge variant="outline" className="font-mono text-xs">Planned: ${formatMinorUnitsToCurrency(String(snap.plannedMinor))}</Badge>
                                    )}
                                    {snap.actualMinor !== undefined && (
                                      <Badge variant="outline" className="font-mono text-xs">Actual: ${formatMinorUnitsToCurrency(String(snap.actualMinor))}</Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function PlanningPeriodRow({ period, campaignId }: { period: CampaignPlanningPeriod, campaignId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [updateOpen, setUpdateOpen] = useState(false);
  const [plannedMinor, setPlannedMinor] = useState(period.plannedMinor);
  const [committedMinor, setCommittedMinor] = useState(period.committedMinor);
  const [actualMinor, setActualMinor] = useState(period.actualMinor);
  const [forecastMinor, setForecastMinor] = useState(period.forecastMinor);
  const [updateVarianceReason, setUpdateVarianceReason] = useState("");
  const [updateReason, setUpdateReason] = useState("");

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closeVarianceReason, setCloseVarianceReason] = useState("");
  const [unusedTreatment, setUnusedTreatment] = useState<"expire" | "carry_forward">("expire");

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenApprovedBy, setReopenApprovedBy] = useState("");
  
  const updatePeriod = useUpdateCampaignPlanningPeriod();
  const closePeriod = useCloseCampaignPlanningPeriod();
  const reopenPeriod = useReopenCampaignPlanningPeriod();

  const handleUpdate = async () => {
    try {
      if (!updateReason) throw new Error("A reason for this update is required.");
      await updatePeriod.mutateAsync({
        planningPeriodId: period.id,
        data: {
          plannedMinor,
          committedMinor,
          actualMinor,
          forecastMinor,
          varianceExplanation: updateVarianceReason || null,
          rowVersion: period.rowVersion,
          reason: updateReason
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setUpdateOpen(false);
      setUpdateReason("");
      toast({ title: "Period updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleClose = async () => {
    try {
      if (!closeReason) throw new Error("A reconciliation reason is required to close the period.");
      if (!closeVarianceReason) throw new Error("A variance explanation is required for audit trails.");
      await closePeriod.mutateAsync({
        planningPeriodId: period.id,
        data: { reason: closeReason, varianceExplanation: closeVarianceReason, unusedBudgetTreatment: unusedTreatment }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setCloseOpen(false);
      setCloseReason("");
      setCloseVarianceReason("");
      toast({ title: "Period closed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleReopen = async () => {
    try {
      if (!reopenReason) throw new Error("A reason is required to reopen a closed period.");
      if (!reopenApprovedBy) throw new Error("An approver reference is required.");
      await reopenPeriod.mutateAsync({
        planningPeriodId: period.id,
        data: { reason: reopenReason, approvedBy: reopenApprovedBy }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setReopenOpen(false);
      setReopenReason("");
      setReopenApprovedBy("");
      toast({ title: "Period reopened" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const remainingMinor = subtractMinorUnits(period.approvedMinor, period.actualMinor);
  const varianceMinor = subtractMinorUnits(period.plannedMinor, period.actualMinor);
  const isVarianceNegative = varianceMinor.startsWith('-');

  return (
    <tr className="hover:bg-muted/10 transition-colors">
      <td className="px-4 py-4 font-semibold">{period.readableName}</td>
      <td className="px-4 py-4 text-right font-semibold text-primary">${formatMinorUnitsToCurrency(period.approvedMinor)}</td>
      <td className="px-4 py-4 text-right text-muted-foreground">${formatMinorUnitsToCurrency(period.plannedMinor)}</td>
      <td className="px-4 py-4 text-right text-muted-foreground">${formatMinorUnitsToCurrency(period.committedMinor)}</td>
      <td className="px-4 py-4 text-right font-medium">${formatMinorUnitsToCurrency(period.actualMinor)}</td>
      <td className="px-4 py-4 text-right text-muted-foreground">${formatMinorUnitsToCurrency(remainingMinor)}</td>
      <td className="px-4 py-4 text-center">
        <Badge variant="outline" className={period.status === 'open' ? 'text-primary border-primary/30' : ''}>
          {period.status}
        </Badge>
      </td>
      <td className="px-4 py-4 text-right">
        <div className="flex justify-end gap-2">
          {period.status === 'open' ? (
            <>
              <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Edit3 className="h-4 w-4" /></Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader><DialogTitle>Update Period Details</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Planned Amount</Label>
                      <Input value={plannedMinor} onChange={e => setPlannedMinor(e.target.value)} type="text" />
                    </div>
                    <div className="space-y-2">
                      <Label>Committed Amount</Label>
                      <Input value={committedMinor} onChange={e => setCommittedMinor(e.target.value)} type="text" />
                    </div>
                    <div className="space-y-2">
                      <Label>Actual Amount</Label>
                      <Input value={actualMinor} onChange={e => setActualMinor(e.target.value)} type="text" />
                    </div>
                    <div className="space-y-2">
                      <Label>Forecast Amount</Label>
                      <Input value={forecastMinor} onChange={e => setForecastMinor(e.target.value)} type="text" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Variance Explanation (Optional)</Label>
                      <Input value={updateVarianceReason} onChange={e => setUpdateVarianceReason(e.target.value)} placeholder="Explain any divergence from plan..." />
                    </div>
                    <div className="space-y-2 col-span-2 pt-2 border-t mt-2">
                      <Label className="text-destructive font-semibold">Change Reason (Required)</Label>
                      <Input value={updateReason} onChange={e => setUpdateReason(e.target.value)} placeholder="Reason for these updates..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleUpdate} disabled={updatePeriod.isPending || !updateReason}>Save Updates</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">Close</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Close Financial Period</DialogTitle>
                    <DialogDescription>
                      Closing this period requires reconciling the variance between planned and actual spend.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-muted/20 rounded-md">
                      <div>
                        <span className="text-xs text-muted-foreground uppercase block">Planned</span>
                        <span className="font-semibold text-lg">${formatMinorUnitsToCurrency(period.plannedMinor)}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase block">Actual</span>
                        <span className="font-semibold text-lg">${formatMinorUnitsToCurrency(period.actualMinor)}</span>
                      </div>
                      <div className="col-span-2 border-t pt-2 mt-2">
                        <span className="text-xs text-muted-foreground uppercase block">Variance</span>
                        <span className={`font-semibold text-lg ${isVarianceNegative ? 'text-destructive' : 'text-emerald-600'}`}>
                          ${formatMinorUnitsToCurrency(varianceMinor)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Variance Explanation (Required)</Label>
                      <Input value={closeVarianceReason} onChange={e => setCloseVarianceReason(e.target.value)} placeholder="Explain the variance..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Reconciliation Reason (Required)</Label>
                      <Input value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Q1 Financial Close..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Unused Budget Treatment</Label>
                      <select 
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                        value={unusedTreatment} 
                        onChange={e => setUnusedTreatment(e.target.value as "expire" | "carry_forward")}
                      >
                        <option value="expire">Expire (Return to central pool)</option>
                        <option value="carry_forward">Carry Forward (Add to next period)</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="destructive" onClick={handleClose} disabled={closePeriod.isPending || !closeReason || !closeVarianceReason}>
                      Lock & Close Period
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">Reopen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reopen Financial Period</DialogTitle>
                  <DialogDescription className="text-destructive font-medium">
                    Reopening a closed period is an exceptional action that requires executive approval.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Approved By (Required)</Label>
                    <Input value={reopenApprovedBy} onChange={e => setReopenApprovedBy(e.target.value)} placeholder="Name or ticket reference of approver..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Reason for Reopening (Required)</Label>
                    <Input value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder="Late invoice processing..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="destructive" onClick={handleReopen} disabled={reopenPeriod.isPending || !reopenReason || !reopenApprovedBy}>
                    Reopen Period
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </td>
    </tr>
  );
}

function ActivityRow({ activity, campaignId, campaign }: { activity: CampaignActivityDetail, campaignId: string, campaign: CampaignDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [updateOpen, setUpdateOpen] = useState(false);
  const [name, setName] = useState(activity.name);
  const [cost, setCost] = useState(activity.authoritativeCostMinor);
  
  const [allocateOpen, setAllocateOpen] = useState(false);

  const updateActivity = useUpdateCampaignActivity();
  const allocateActivity = useAllocateActivityAcrossPeriods();

  const handleUpdate = async () => {
    try {
      await updateActivity.mutateAsync({
        activityId: activity.id,
        data: {
          name,
          deliveryStartDate: activity.deliveryStartDate,
          deliveryEndDate: activity.deliveryEndDate,
          authoritativeCostMinor: parseDecimalToMinorUnits(cost),
          currency: activity.currency,
          productValueIds: activity.productValueIds,
          reason: "Manual update"
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setUpdateOpen(false);
      toast({ title: "Activity updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAllocate = async () => {
    try {
      await allocateActivity.mutateAsync({
        activityId: activity.id,
        data: { method: "daily" }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setAllocateOpen(false);
      toast({ title: "Activity allocated across periods" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border bg-muted/5">
      <div className="flex justify-between items-center">
        <span className="font-semibold text-sm">{activity.name}</span>
        <div className="flex gap-2">
          <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">Allocate</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Allocate Activity</DialogTitle></DialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">Distributes the cost across the active periods using daily weighting.</p>
              </div>
              <DialogFooter>
                <Button onClick={handleAllocate} disabled={allocateActivity.isPending}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Edit3 className="h-3.5 w-3.5" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Update Activity</DialogTitle></DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Authoritative Cost</Label>
                  <Input value={cost} onChange={e => setCost(e.target.value)} type="text" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUpdate} disabled={updateActivity.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">Cost: ${formatMinorUnitsToCurrency(activity.authoritativeCostMinor)}</span>
    </div>
  );
}

function CostRow({
  cost,
  campaignId,
  products,
}: {
  cost: CampaignCostDetail;
  campaignId: string;
  products: CampaignDetail["products"];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [updateOpen, setUpdateOpen] = useState(false);
  const [dimOpen, setDimOpen] = useState(false);

  const [desc, setDesc] = useState(cost.description);
  const [amount, setAmount] = useState(cost.authoritativeAmountMinor);
  const [dimensionProductId, setDimensionProductId] = useState(
    cost.dimensions.find((item) => item.dimension === "product")?.dimensionKey
      ?? products.find((item) => item.isPrimary)?.productValueId
      ?? products[0]?.productValueId
      ?? "",
  );

  const updateCost = useUpdateCampaignCost();
  const replaceDims = useReplaceCampaignCostDimensions();

  const handleUpdate = async () => {
    try {
      await updateCost.mutateAsync({
        costId: cost.id,
        data: {
          description: desc,
          authoritativeAmountMinor: parseDecimalToMinorUnits(amount),
          currency: cost.currency,
          reason: "Manual update"
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setUpdateOpen(false);
      toast({ title: "Cost updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSetDimensions = async () => {
    try {
      await replaceDims.mutateAsync({
        costId: cost.id,
        data: {
          allocations: [{
            dimension: "product",
            dimensionKey: dimensionProductId,
            allocationBasisPoints: 10000
          }]
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      setDimOpen(false);
      toast({ title: "Product allocation reconciled to 100%" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border bg-muted/5">
      <div className="flex justify-between items-center">
        <span className="font-semibold text-sm">{cost.description}</span>
        <div className="flex gap-2">
          <Dialog open={dimOpen} onOpenChange={setDimOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">Dimensions</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Set Cost Dimensions</DialogTitle></DialogHeader>
              <div className="space-y-2 py-4">
                <Label>Governed campaign product</Label>
                <Select value={dimensionProductId} onValueChange={setDimensionProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a planned product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.productValueId}>
                        {product.productValueId}
                        {product.isPrimary ? " (Primary)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  The authoritative amount remains on the cost record. This reporting allocation stores only 10,000 basis points (100%).
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSetDimensions}
                  disabled={replaceDims.isPending || !dimensionProductId}
                >
                  Apply 100%
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Edit3 className="h-3.5 w-3.5" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Update Cost</DialogTitle></DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={desc} onChange={e => setDesc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input value={amount} onChange={e => setAmount(e.target.value)} type="text" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUpdate} disabled={updateCost.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">Amount: ${formatMinorUnitsToCurrency(cost.authoritativeAmountMinor)}</span>
      {cost.dimensions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {cost.dimensions.map((dimension) => (
            <Badge key={dimension.id} variant="outline" className="text-[10px]">
              {dimension.dimension}: {(dimension.allocationBasisPoints / 100).toFixed(2)}%
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[250px] w-full">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
        {icon}
      </div>
      <h3 className="mb-1 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[250px] mx-auto">{description}</p>
    </div>
  );
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
    case "approved":
      return <Badge variant="default" className="bg-primary/10 text-primary border-primary/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
    case "draft":
      return <Badge variant="secondary" className="bg-secondary text-secondary-foreground"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
    case "submitted":
      return <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-50/50"><Activity className="w-3 h-3 mr-1" /> In Review</Badge>;
    default:
      return <Badge variant="outline" className="uppercase tracking-wider text-[10px]">{status}</Badge>;
  }
};
