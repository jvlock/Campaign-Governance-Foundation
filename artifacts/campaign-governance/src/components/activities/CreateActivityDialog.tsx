import { useState, useEffect } from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Link as LinkIcon, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseDecimalToMinorUnits } from "@/lib/utils";

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

  // Auto-fill inheritable fields when config changes
  useEffect(() => {
    if (selectedConfig && campaign) {
      const inherited = selectedConfig.inheritableFields || [];
      if (inherited.includes("deliveryStartDate") && campaign.startDate) {
        form.setValue("deliveryStartDate", campaign.startDate.split('T')[0]);
      }
      if (inherited.includes("deliveryEndDate") && campaign.endDate) {
        const inheritedEnd = campaign.isEvergreen ? campaign.reviewDate : campaign.endDate;
        if (inheritedEnd) form.setValue("deliveryEndDate", inheritedEnd.split('T')[0]);
      }
      if (inherited.includes("productValueIds")) {
        form.setValue("productValueIds", campaign.products?.map((product) => product.productValueId) ?? []);
      }
    }
  }, [selectedConfigId, campaign, form, selectedConfig]);

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
                      <FormItem>
                        <FormLabel>Budget Allocation</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                            <Input {...field} className="pl-7" />
                          </div>
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({field}) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="parentActivityId" render={({field}) => (
                      <FormItem className="col-span-2">
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
