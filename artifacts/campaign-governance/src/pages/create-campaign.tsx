import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useCreateCampaign, 
  useSetCampaignBudget,
  useListFiscalCalendars,
  getListCampaignsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, CalendarIcon, Loader2, ArrowRight } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn, parseDecimalToMinorUnits } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  name: z.string().min(5, "Campaign name must be at least 5 characters").max(100),
  campaignType: z.enum([
    "integrated", "activation", "nurture", "event", 
    "research_content", "paid_media", "sales_cadence", 
    "client_expansion", "newsletter", "in_app", "approved_other"
  ]),
  relationshipType: z.enum(["new", "wave", "activity", "copy"]),
  objective: z.string().min(10, "Please provide a clear objective").optional().or(z.literal("")),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  isEvergreen: z.boolean().default(false),
  reviewDate: z.date().optional(),
  
  // Budget
  fiscalCalendarId: z.string().min(1, "Fiscal calendar required"),
  requestedTotal: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid positive amount"),
  approvedTotal: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid positive amount"),
  currency: z.string().min(3).max(3),
  budgetOwner: z.string().min(1, "Owner required"),
  costCenter: z.string().min(1, "Cost center required"),
  fundingSource: z.string().min(1, "Funding source required"),
  allocationMethod: z.enum([
    "even", "monthly", "quarterly", "activity", "channel", "custom"
  ]),
}).refine(data => {
  if (!data.isEvergreen && data.startDate && data.endDate) {
    return data.endDate > data.startDate;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
});

export default function CreateCampaign() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [createdCampaignKey, setCreatedCampaignKey] = useState<string | null>(null);

  const { data: calendars } = useListFiscalCalendars();
  const primaryCalendar = calendars?.[0];
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      campaignType: "integrated",
      relationshipType: "new",
      objective: "",
      isEvergreen: false,
      fiscalCalendarId: primaryCalendar?.id || "",
      requestedTotal: "0.00",
      approvedTotal: "0.00",
      currency: "USD",
      budgetOwner: "",
      costCenter: "",
      fundingSource: "",
      allocationMethod: "even",
    }
  });

  const isEvergreen = form.watch("isEvergreen");

  const createCampaign = useCreateCampaign();
  const setCampaignBudget = useSetCampaignBudget();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    let campaignKey = createdCampaignKey;
    try {
      if (!campaignKey) {
        // 1. Create the campaign
        const result = await createCampaign.mutateAsync({
          data: {
            name: values.name,
            campaignType: values.campaignType,
            relationshipType: values.relationshipType,
            objective: values.objective || undefined,
            isEvergreen: values.isEvergreen,
            startDate: values.startDate ? format(values.startDate, "yyyy-MM-dd") : undefined,
            endDate: (!values.isEvergreen && values.endDate) ? format(values.endDate, "yyyy-MM-dd") : undefined,
            reviewDate: values.reviewDate ? format(values.reviewDate, "yyyy-MM-dd") : undefined,
          }
        });
        campaignKey = result.campaignKey;
        setCreatedCampaignKey(campaignKey);
      }
      
      // 2. Set the initial budget if a snapshot exists
      const cal = calendars?.find(c => c.id === values.fiscalCalendarId);
      if (cal && cal.activeSnapshotId) {
        await setCampaignBudget.mutateAsync({
          campaignKey,
          data: {
            fiscalCalendarSnapshotId: cal.activeSnapshotId,
            requestedMinor: parseDecimalToMinorUnits(values.requestedTotal),
            approvedMinor: parseDecimalToMinorUnits(values.approvedTotal),
            currency: values.currency,
            currencyMinorUnits: 2,
            budgetOwner: values.budgetOwner,
            costCenter: values.costCenter,
            fundingSource: values.fundingSource,
            allocationMethod: values.allocationMethod,
          }
        });
      }
      
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      
      toast({
        title: "Campaign Initialized",
        description: `Successfully created ${campaignKey}`,
      });
      
      setCreatedCampaignKey(null);
      setLocation(`/campaigns/${campaignKey}`);
    } catch (err: any) {
      // If we failed after creation, invalidate list so it shows up
      if (campaignKey) {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      }
      toast({
        variant: "destructive",
        title: "Initialization Failed",
        description: err.message || "An unexpected error occurred",
      });
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase tracking-widest text-[10px] font-bold">New Foundation</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Initialize Campaign
        </h1>
        <p className="text-muted-foreground text-sm">
          Establish the enduring identity and financial constraints for a new campaign. 
          Audience segments and products are configured in the next phase.
        </p>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary font-bold">Governance Note</AlertTitle>
        <AlertDescription className="text-primary/80">
          Campaign identity is immutable once created. This establishes the master UTM key used across all downstream systems.
        </AlertDescription>
      </Alert>

      {createdCampaignKey && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
          <AlertTitle className="font-bold">Budget Setup Failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Campaign identity <strong>{createdCampaignKey}</strong> was created successfully, but applying the financial constraints failed.</p>
            <p>Please review the budget details below and retry, or continue to the campaign dashboard to finish setup later.</p>
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setLocation(`/campaigns/${createdCampaignKey}`)}>
                Skip to Campaign Dashboard <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* Identity & Context */}
          <Card className="border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-lg">Identity & Context</CardTitle>
              <CardDescription>Core identity that defines this initiative</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 pt-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold">Campaign Name</FormLabel>
                    <FormControl>
                      <Input disabled={!!createdCampaignKey} placeholder="e.g. Q4 Enterprise Cloud Migration" className="bg-background max-w-xl" {...field} />
                    </FormControl>
                    <FormDescription>Must be descriptive and unique within the fiscal year.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="campaignType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Type Classification</FormLabel>
                      <Select disabled={!!createdCampaignKey} onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="integrated">Integrated Global Campaign</SelectItem>
                          <SelectItem value="activation">Regional Activation</SelectItem>
                          <SelectItem value="nurture">Always-On Nurture</SelectItem>
                          <SelectItem value="event">Major Event / Conference</SelectItem>
                          <SelectItem value="paid_media">Paid Media Burst</SelectItem>
                          <SelectItem value="client_expansion">Client Expansion</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="relationshipType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Hierarchy Relationship</FormLabel>
                      <Select disabled={!!createdCampaignKey} onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select relationship" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="new">Net New Independent</SelectItem>
                          <SelectItem value="wave">Wave of Existing</SelectItem>
                          <SelectItem value="activity">Sub-Activity</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold">Primary Objective</FormLabel>
                    <FormControl>
                      <Textarea 
                        disabled={!!createdCampaignKey}
                        placeholder="What is the measurable business outcome this campaign will drive?" 
                        className="resize-none bg-background min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Temporal Governance */}
          <Card className="border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-lg">Temporal Governance</CardTitle>
              <CardDescription>When is this initiative active in market?</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 pt-6">
              <FormField
                control={form.control}
                name="isEvergreen"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-background">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Evergreen Campaign</FormLabel>
                      <FormDescription>
                        This campaign runs continuously without a planned end date (e.g. baseline nurture).
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        disabled={!!createdCampaignKey}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-primary"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-foreground font-semibold">Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={!!createdCampaignKey}
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal bg-background",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className={cn("text-foreground font-semibold", isEvergreen && "text-muted-foreground")}>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={isEvergreen || !!createdCampaignKey}
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal bg-background",
                                !field.value && "text-muted-foreground",
                                isEvergreen && "opacity-50"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const start = form.getValues("startDate");
                              return start ? date < start : false;
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reviewDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-foreground font-semibold">Review Date (Optional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={!!createdCampaignKey}
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal bg-background",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Budget */}
          <Card className="border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-lg">Financial Identity</CardTitle>
              <CardDescription>Fiscal calendar mapping and budget setup</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 pt-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fiscalCalendarId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Governing Fiscal Calendar</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select calendar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {calendars?.map(c => (
                            <SelectItem key={c.id} value={c.id} disabled={!c.activeSnapshotId}>
                              {c.name} {!c.activeSnapshotId && "(No active snapshot)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Currency</FormLabel>
                      <FormControl>
                        <Input placeholder="USD" className="bg-background uppercase" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="requestedTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Requested Total</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="e.g. 10000.00" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="approvedTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Approved Total (Committed)</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="e.g. 5000.00" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="budgetOwner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Budget Owner</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Jane Doe" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costCenter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Cost Center</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MKT-4001" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fundingSource"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Funding Source</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Q3 Growth Fund" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allocationMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Distribution Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="even">Even over active periods</SelectItem>
                          <SelectItem value="monthly">Monthly weighted</SelectItem>
                          <SelectItem value="quarterly">Quarterly weighted</SelectItem>
                          <SelectItem value="activity">Activity-based</SelectItem>
                          <SelectItem value="channel">Channel-based</SelectItem>
                          <SelectItem value="custom">Custom schedule</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4 pt-4 pb-20">
            <Link href="/campaigns">
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createCampaign.isPending || setCampaignBudget.isPending} className="shadow-sm shadow-primary/20 gap-2 font-bold px-8">
              {(createCampaign.isPending || setCampaignBudget.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {createdCampaignKey ? "Retry Budget Setup" : "Initialize Immutable Key & Budget"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
