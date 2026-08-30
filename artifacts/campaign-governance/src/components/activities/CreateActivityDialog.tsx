import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCampaignActivity,
  getGetCampaignQueryKey,
  useListActivityTypeConfigurations,
  getListActivityTypeConfigurationsQueryKey,
  type CampaignDetail,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Link as LinkIcon, Lock, AlertCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { parseDecimalToMinorUnits, formatMinorUnitsToCurrency } from "@/lib/utils";
import { differenceInDays, parseISO, max, min, isValid } from "date-fns";

export function CreateActivityDialog({ campaign }: { campaign: CampaignDetail }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateCampaignActivity();

  const { data: configs, isLoading: isConfigsLoading } = useListActivityTypeConfigurations({}, {
    query: { queryKey: getListActivityTypeConfigurationsQueryKey() }
  });
  
  const publishedConfigs = configs?.filter(c => c.status === 'published') || [];

  const form = useForm({
    defaultValues: {
      configurationId: "",
      name: "",
      deliveryStartDate: "",
      deliveryEndDate: "",
      authoritativeCostMinor: "0",
      currency: "USD",
      parentActivityId: "",
      status: "draft",
      owner: "",
      source: "",
      platform: "",
      audienceTreatment: "",
      region: "",
      language: "",
      primaryCta: "",
      landingDestination: "",
      assetIds: "",
      externalIds: "{}",
      productValueIds: [] as string[],
      configurationAnswers: {} as Record<string, string>
    }
  });

  const selectedConfigId = form.watch("configurationId");
  const selectedConfig = publishedConfigs.find(c => c.id === selectedConfigId);
  const answers = form.watch("configurationAnswers");
  const deliveryStartDate = form.watch("deliveryStartDate");
  const deliveryEndDate = form.watch("deliveryEndDate");
  const authoritativeCostMinorStr = form.watch("authoritativeCostMinor");

  // Preview the same integer-minor-unit, largest-remainder allocation used by the server.
  const allocationPreview = useMemo(() => {
    if (!deliveryStartDate || !deliveryEndDate || !authoritativeCostMinorStr) return null;
    try {
      const start = parseISO(deliveryStartDate);
      const end = parseISO(deliveryEndDate);
      if (!isValid(start) || !isValid(end) || end < start) return null;

      const totalAmount = BigInt(parseDecimalToMinorUnits(authoritativeCostMinorStr));
      if (totalAmount <= 0n) return null;

      const periods = [...(campaign.planningPeriods || [])]
        .sort((a, b) => a.fiscalPeriod.startDate.localeCompare(b.fiscalPeriod.startDate));
      const overlaps = periods.map(p => {
        const pStart = parseISO(p.fiscalPeriod.startDate);
        const pEnd = parseISO(p.fiscalPeriod.endDate);
        const overlapStart = max([start, pStart]);
        const overlapEnd = min([end, pEnd]);

        const days = overlapEnd >= overlapStart ? differenceInDays(overlapEnd, overlapStart) + 1 : 0;
        return { period: p, days };
      });

      const touched = overlaps.filter(o => o.days > 0);
      const totalDays = touched.reduce((sum, o) => sum + o.days, 0);
      const expectedDays = differenceInDays(end, start) + 1;
      if (totalDays === 0 || totalDays !== expectedDays) {
        return { totalDays, expectedDays, allocations: [], hasCoverageGap: true };
      }

      const denominator = BigInt(totalDays);
      const rows = touched.map((overlap, order) => {
        const numerator = totalAmount * BigInt(overlap.days);
        return {
          ...overlap,
          order,
          amount: numerator / denominator,
          remainder: numerator % denominator,
        };
      });
      let remainder = totalAmount - rows.reduce((sum, row) => sum + row.amount, 0n);
      const remainderOrder = [...rows].sort((a, b) =>
        a.remainder === b.remainder ? a.order - b.order : a.remainder > b.remainder ? -1 : 1,
      );
      for (let index = 0; remainder > 0n; index += 1, remainder -= 1n) {
        remainderOrder[index % remainderOrder.length]!.amount += 1n;
      }
      const allocations = rows.sort((a, b) => a.order - b.order)
        .map(row => ({ period: row.period, amount: row.amount, days: row.days }));

      return { totalDays, expectedDays, allocations, hasCoverageGap: false };
    } catch {
      return null;
    }
  }, [deliveryStartDate, deliveryEndDate, authoritativeCostMinorStr, campaign.planningPeriods]);

  const [seededConfigId, setSeededConfigId] = useState<string | null>(null);

  // Auto-fill inheritable fields when config changes
  useEffect(() => {
    if (selectedConfig && campaign && seededConfigId !== selectedConfig.id) {
      const inherited = selectedConfig.inheritableFields || [];
      const overrides = selectedConfig.permittedOverrides || [];

      if (inherited.includes("deliveryStartDate") && campaign.startDate) {
        // Only overwrite if it's not a permitted override OR if it's currently empty
        if (!overrides.includes("deliveryStartDate") || !form.getValues("deliveryStartDate")) {
          form.setValue("deliveryStartDate", campaign.startDate.split('T')[0]);
        }
      }
      if (inherited.includes("deliveryEndDate")) {
        const inheritedEnd = campaign.isEvergreen ? campaign.reviewDate : campaign.endDate;
        if (!overrides.includes("deliveryEndDate") || !form.getValues("deliveryEndDate")) {
          if (inheritedEnd) form.setValue("deliveryEndDate", inheritedEnd.split('T')[0]);
        }
      }
      if (inherited.includes("productValueIds")) {
        if (!overrides.includes("productValueIds") || form.getValues("productValueIds").length === 0) {
          form.setValue("productValueIds", campaign.products?.map((product) => product.productValueId) ?? []);
        }
      }

      setSeededConfigId(selectedConfig.id);
    }
  }, [selectedConfig, campaign, form, seededConfigId]);

  const isInherited = (fieldName: string) => {
    if (!selectedConfig) return false;
    return selectedConfig.inheritableFields?.includes(fieldName) && !selectedConfig.permittedOverrides?.includes(fieldName);
  };

  const onSubmit = async (values: any) => {
    try {
      let externalIds: Record<string, unknown>;
      try {
        externalIds = JSON.parse(values.externalIds || "{}");
      } catch {
        throw new Error("External system IDs must be valid JSON");
      }
      await createMutation.mutateAsync({
        campaignKey: campaign.campaignKey,
        data: {
          name: values.name,
          deliveryStartDate: values.deliveryStartDate,
          deliveryEndDate: values.deliveryEndDate,
          authoritativeCostMinor: parseDecimalToMinorUnits(values.authoritativeCostMinor),
          currency: values.currency,
          configurationId: selectedConfig?.id,
          activityType: selectedConfig?.stableKey,
          channelValueId: selectedConfig?.channelValueId,
          parentActivityId: values.parentActivityId || undefined,
          status: values.status || "draft",
          owner: values.owner || undefined,
          source: values.source || undefined,
          platform: values.platform || undefined,
          audienceTreatment: values.audienceTreatment || undefined,
          region: values.region || undefined,
          language: values.language || undefined,
          primaryCta: values.primaryCta || undefined,
          landingDestination: values.landingDestination || undefined,
          assetIds: values.assetIds
            ? values.assetIds.split(",").map((value: string) => value.trim()).filter(Boolean)
            : [],
          externalIds,
          configurationAnswers: values.configurationAnswers,
          productValueIds: values.productValueIds,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.campaignKey) });
      toast({ title: "Activity created successfully" });
      setOpen(false);
      form.reset();
    } catch (e: any) {
      toast({ title: "Creation failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="shadow-sm"><Plus className="w-4 h-4 mr-2" /> Plan Activity</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl w-full p-0 flex flex-col border-border/40 shadow-2xl">
        <DialogHeader className="p-6 border-b bg-card shrink-0">
          <DialogTitle>Plan Execution Activity</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[75vh]">
          <Form {...form}>
            <form id="create-activity-form" onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
              
              <FormField control={form.control} name="configurationId" render={({field}) => (
                <FormItem>
                  <FormLabel>Activity Configuration Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="bg-muted/5"><SelectValue placeholder={isConfigsLoading ? "Loading configurations..." : "Select configuration..."} /></SelectTrigger></FormControl>
                    <SelectContent>
                      {publishedConfigs.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex flex-col">
                            <span>{c.displayName}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{c.stableKey}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />

              {selectedConfig && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md border bg-muted/15 p-3">
                    <div className="sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Configuration</p>
                      <p className="text-sm font-semibold">{selectedConfig.displayName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stable type</p>
                      <p className="text-xs font-mono mt-1">{selectedConfig.stableKey}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Version</p>
                      <p className="text-xs font-mono mt-1">v{selectedConfig.version}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({field}) => (
                      <FormItem className="col-span-2"><FormLabel>Activity Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                    
                    <FormField control={form.control} name="deliveryStartDate" render={({field}) => {
                      const locked = isInherited('deliveryStartDate');
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">Start Date {locked && <Lock className="w-3 h-3 text-muted-foreground" />}</FormLabel>
                          <FormControl><Input type="date" {...field} disabled={locked} className={locked ? "bg-muted/30 text-muted-foreground border-dashed" : ""} /></FormControl>
                        </FormItem>
                      );
                    }} />

                    <FormField control={form.control} name="deliveryEndDate" render={({field}) => {
                      const locked = isInherited('deliveryEndDate');
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">End Date {locked && <Lock className="w-3 h-3 text-muted-foreground" />}</FormLabel>
                          <FormControl><Input type="date" {...field} disabled={locked} className={locked ? "bg-muted/30 text-muted-foreground border-dashed" : ""} /></FormControl>
                        </FormItem>
                      );
                    }} />

                    <FormField control={form.control} name="authoritativeCostMinor" render={({field}) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Budget Allocation</FormLabel>
                        <FormControl>
                          <div className="relative">
                             <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                             <Input {...field} className="pl-7 max-w-[50%]" />
                          </div>
                        </FormControl>
                        {allocationPreview && allocationPreview.allocations.length > 0 && (
                          <div className="mt-4 p-4 bg-muted/20 border rounded-md">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                              <AlertCircle className="w-4 h-4" />
                              <h4 className="text-sm font-semibold">Exact-Allocation Preview (Server-Authoritative on Save)</h4>
                            </div>
                            <div className="grid grid-cols-1 gap-2 mt-2">
                              {allocationPreview.allocations.map(a => (
                                <div key={a.period.id} className="flex justify-between items-center text-xs font-mono p-2 bg-background border rounded">
                                  <span>{a.period.fiscalPeriod.stableKey} ({a.days} days)</span>
                                   <span className="font-semibold text-primary">${formatMinorUnitsToCurrency(a.amount.toString())}</span>
                                </div>
                              ))}
                            </div>
                            <FormDescription className="mt-2">
                              Distributes the remainders deterministically in fiscal-period order using daily weighting based on {allocationPreview.totalDays} total active days.
                            </FormDescription>
                          </div>
                        )}
                        {allocationPreview && allocationPreview.hasCoverageGap && (
                          <Alert variant="destructive" className="mt-2 py-2">
                            <AlertTitle className="text-sm m-0">Incomplete fiscal coverage</AlertTitle>
                            <AlertDescription className="text-xs">
                              The activity spans {allocationPreview.expectedDays} days, but only {allocationPreview.totalDays} are covered by campaign planning periods. Adjust the dates or fiscal plan before saving.
                            </AlertDescription>
                          </Alert>
                        )}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({field}) => (
                      <FormItem className="col-span-2 sm:col-span-1">
                        <FormLabel>Status</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="parentActivityId" render={({field}) => (
                      <FormItem className="col-span-2 sm:col-span-1">
                        <FormLabel>Parent Activity / Wave</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)} value={field.value || "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="No parent activity" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">No parent activity</SelectItem>
                            {(campaign.activities ?? []).map((activity) => (
                              <SelectItem key={activity.id} value={activity.id}>{activity.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Delivery Context</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {([
                        ["owner", "Owner"],
                        ["source", "Source"],
                        ["platform", "Platform"],
                        ["audienceTreatment", "Audience Treatment"],
                        ["region", "Region / Geography"],
                        ["language", "Language"],
                        ["primaryCta", "Primary CTA"],
                        ["landingDestination", "Landing Destination"],
                      ] as const).map(([name, label]) => (
                        <FormField key={name} control={form.control} name={name} render={({field}) => (
                          <FormItem>
                            <FormLabel>{label}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                          </FormItem>
                        )} />
                      ))}
                      <FormField control={form.control} name="assetIds" render={({field}) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Reusable Asset IDs (comma separated)</FormLabel>
                          <FormControl><Input {...field} className="font-mono text-xs" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="externalIds" render={({field}) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>External System IDs (JSON)</FormLabel>
                          <FormControl><Textarea {...field} className="font-mono text-xs min-h-20" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <FormField control={form.control} name="productValueIds" render={({field}) => {
                    const locked = isInherited("productValueIds");
                    return (
                      <FormItem className="space-y-3 pt-4 border-t">
                        <FormLabel className="flex items-center gap-2">
                          Promoted Products {locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                        </FormLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(campaign.products ?? []).map((product) => {
                            const checked = field.value.includes(product.productValueId);
                            return (
                              <label key={product.id} className="flex items-center gap-2 rounded border p-3 text-sm">
                                <Checkbox
                                  checked={checked}
                                  disabled={locked}
                                  onCheckedChange={(next) => field.onChange(
                                    next
                                      ? [...field.value, product.productValueId]
                                      : field.value.filter((id: string) => id !== product.productValueId),
                                  )}
                                />
                                <span className="font-mono text-xs break-all">{product.productValueId}</span>
                              </label>
                            );
                          })}
                        </div>
                      </FormItem>
                    );
                  }} />

                  {selectedConfig.questions.length > 0 && (
                    <div className="space-y-4 pt-4 border-t">
                      <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" /> Configuration Details
                      </h4>
                      <div className="grid grid-cols-1 gap-4 bg-muted/5 p-4 rounded-md border">
                        {selectedConfig.questions.map(q => {
                          const isVisible = q.requiredWhen ? answers?.[q.requiredWhen.field] === q.requiredWhen.equals : true;
                          if (!isVisible) return null;
                          
                          if (q.options && q.options.length > 0) {
                            return (
                              <FormField key={q.key} control={form.control} name={`configurationAnswers.${q.key}`} render={({field}) => (
                                <FormItem>
                                  <FormLabel>{q.label} {q.required && <span className="text-destructive">*</span>}</FormLabel>
                                  <Select onValueChange={field.onChange} value={String(field.value ?? "")}>
                                    <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                                    <SelectContent>
                                      {q.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                            );
                          }
                          return (
                            <FormField key={q.key} control={form.control} name={`configurationAnswers.${q.key}`} render={({field}) => (
                              <FormItem>
                                <FormLabel>{q.label} {q.required && <span className="text-destructive">*</span>}</FormLabel>
                                <FormControl><Input {...field} value={field.value as string || ''} className="bg-background" /></FormControl>
                              </FormItem>
                            )} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </Form>
        </ScrollArea>
        <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="create-activity-form" disabled={createMutation.isPending || !selectedConfigId}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
