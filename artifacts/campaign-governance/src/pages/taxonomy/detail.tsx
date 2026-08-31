import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

import { 
  useGetGovernedValue, 
  useCreateGovernedValue, 
  useUpdateGovernedValue,
  useTransitionGovernedValue,
  useCreateTaxonomyAssociation,
  useListGovernedValueHistory,
  useListTaxonomyCategories,
  useListGovernedValues,
  getGetGovernedValueQueryKey,
  getListGovernedValuesQueryKey,
  getListGovernedValueHistoryQueryKey
} from "@workspace/api-client-react";
import type { GovernanceTransitionInputAction, TaxonomyCategoryKey } from "@workspace/api-client-react";

import { TaxonomyGuard, useTaxonomyAccess } from "@/components/taxonomy/taxonomy-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  ArrowLeft, Save, ShieldCheck, History, Activity, AlertCircle, PlayCircle, ArchiveX, Link as LinkIcon, Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const valueSchema = z.object({
  stableKey: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Alphanumeric, dashes, and underscores only"),
  category: z.string().optional(),
  displayName: z.string().min(1, "Display name is required").max(100),
  definition: z.string().min(1, "Definition is required"),
  effectiveStart: z.string().min(1, "Effective start is required"),
  effectiveEnd: z.string().optional().nullable(),
  taxonomyVersion: z.string().min(1, "Taxonomy version is required"),
  source: z.string().min(1, "System of record is required"),
  owner: z.string().min(1, "Owner is required"),
  legacyCodes: z.string().optional(),
  parentId: z.string().optional().nullable(),
  measurementRule: z.string().optional().nullable(),
  metadataString: z.string().optional().refine((val) => {
    if (!val || val.trim() === '') return true;
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }, "Must be a valid JSON object (e.g. {\"key\": \"value\"})"),
});

type ValueFormValues = z.infer<typeof valueSchema>;

function TaxonomyDetailContent() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const access = useTaxonomyAccess();
  
  const isNew = !params.id || params.id === "new";
  const valueId = isNew ? "" : params.id!;
  
  const [isEditing, setIsEditing] = useState(isNew || new URLSearchParams(window.location.search).get('edit') === 'true');

  const [transitionState, setTransitionState] = useState<{ open: boolean, action: GovernanceTransitionInputAction | null }>({ open: false, action: null });
  const [transitionReason, setTransitionReason] = useState("");
  const [replacementId, setReplacementId] = useState("");
  
  const [retentionOpen, setRetentionOpen] = useState(false);
  
  const [assocOpen, setAssocOpen] = useState(false);
  const [assocToId, setAssocToId] = useState("");
  const [assocType, setAssocType] = useState("");

  const { data: categories } = useListTaxonomyCategories();
  
  const { data: detail, isLoading: isLoadingDetail, isError } = useGetGovernedValue(valueId, { 
    query: { enabled: !isNew, queryKey: getGetGovernedValueQueryKey(valueId) } 
  });

  const { data: history } = useListGovernedValueHistory(valueId, {
    query: { enabled: !isNew, queryKey: getListGovernedValueHistoryQueryKey(valueId) }
  });

  const createMut = useCreateGovernedValue();
  const updateMut = useUpdateGovernedValue();
  const transitionMut = useTransitionGovernedValue();
  const assocMut = useCreateTaxonomyAssociation();

  const form = useForm<ValueFormValues>({
    resolver: zodResolver(valueSchema),
    defaultValues: {
      stableKey: "",
      category: "",
      displayName: "",
      definition: "",
      effectiveStart: new Date().toISOString().split('T')[0],
      effectiveEnd: "",
      taxonomyVersion: "1.0.0",
      source: "Manual",
      owner: "System Admin",
      legacyCodes: "",
      parentId: "",
      measurementRule: "",
      metadataString: "",
    }
  });

  const activeCategoryKey = form.watch("category") || detail?.category || "";
  const activeCategory = categories?.find(c => c.key === activeCategoryKey);
  const supportsParent = activeCategory?.supportsParent ?? false;
  const supportsMeasurementRule = activeCategory?.supportsMeasurementRule ?? false;

  const parentCategories: Record<string, string> = {
    subsegment: "segment",
    persona: "buying_group_function",
    product: "product_family",
    capability_solution: "product",
    source: "channel",
    delivery_mechanism: "source",
    subregion: "region",
    country: "subregion",
    market_cluster: "country",
    fiscal_year: "fiscal_calendar",
    fiscal_quarter: "fiscal_year",
    fiscal_period: "fiscal_quarter",
    campaign_member_status_template: "activity_type",
    campaign_shortcode: "product_line",
    subcampaign: "campaign_shortcode",
  };

  const getExpectedParentCategory = (category: string) => parentCategories[category] ?? category;

  const expectedParentCategory = activeCategoryKey
    ? getExpectedParentCategory(activeCategoryKey) as TaxonomyCategoryKey
    : undefined;

  const { data: parentCandidates, isLoading: isLoadingParents } = useListGovernedValues(
    { status: "active", category: expectedParentCategory },
    { query: { enabled: !!expectedParentCategory && supportsParent, queryKey: getListGovernedValuesQueryKey({ status: "active", category: expectedParentCategory }) } }
  );

  const hasAssociations = detail?.associations && detail.associations.length > 0;
  const { data: allActiveValues } = useListGovernedValues(
    { status: "active" },
    { query: { enabled: assocOpen || hasAssociations, queryKey: getListGovernedValuesQueryKey({ status: "active" }) } },
  );

  useEffect(() => {
    if (detail && !isNew) {
      form.reset({
        stableKey: detail.stableKey,
        category: detail.category,
        displayName: detail.displayName,
        definition: detail.definition,
        effectiveStart: detail.effectiveStart.split('T')[0],
        effectiveEnd: detail.effectiveEnd ? detail.effectiveEnd.split('T')[0] : "",
        taxonomyVersion: detail.taxonomyVersion,
        source: detail.source,
        owner: detail.owner,
        legacyCodes: detail.legacyCodes?.join(", ") || "",
        parentId: detail.parentId || "",
        measurementRule: detail.measurementRule || "",
        metadataString: detail.metadata && Object.keys(detail.metadata).length > 0
          ? JSON.stringify(detail.metadata, null, 2)
          : "",
      });
    }
  }, [detail, isNew, form]);

  if (!isNew && isLoadingDetail) {
    return <div className="p-8"><Skeleton className="h-[600px] w-full" /></div>;
  }

  if (!isNew && isError) {
    return <div className="p-8 text-destructive font-medium">Failed to load value. It may have been deleted or you lack permissions.</div>;
  }

  const onSubmit = (data: ValueFormValues) => {
    if (isNew && !data.category) {
      form.setError("category", { message: "Category is required" });
      return;
    }
    const legacyArray = data.legacyCodes ? data.legacyCodes.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const metadataObj = data.metadataString?.trim() ? JSON.parse(data.metadataString) : {};

    if (isNew) {
      createMut.mutate({
        data: {
          stableKey: data.stableKey,
          category: data.category as any,
          displayName: data.displayName,
          definition: data.definition,
          effectiveStart: data.effectiveStart,
          effectiveEnd: data.effectiveEnd || null,
          taxonomyVersion: data.taxonomyVersion,
          source: data.source,
          owner: data.owner,
          parentId: supportsParent ? (data.parentId || null) : null,
          measurementRule: supportsMeasurementRule ? (data.measurementRule || null) : null,
          legacyCodes: legacyArray,
          metadata: metadataObj,
        }
      }, {
        onSuccess: (res) => {
          toast({ title: "Value Created", description: `Successfully created ${data.displayName}` });
          queryClient.invalidateQueries({ queryKey: getListGovernedValuesQueryKey() });
          setLocation(`/taxonomy/${res.id}`);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.response?.data?.error || "Failed to create value", variant: "destructive" });
        }
      });
    } else {
      updateMut.mutate({
        id: valueId,
        data: {
          displayName: data.displayName,
          definition: data.definition,
          effectiveStart: data.effectiveStart,
          rowVersion: detail!.rowVersion,
          effectiveEnd: data.effectiveEnd || null,
          taxonomyVersion: data.taxonomyVersion,
          source: data.source,
          owner: data.owner,
          parentId: supportsParent ? (data.parentId || null) : null,
          measurementRule: supportsMeasurementRule ? (data.measurementRule || null) : null,
          legacyCodes: legacyArray,
          metadata: metadataObj,
        }
      }, {
        onSuccess: () => {
          toast({ title: "Value Updated", description: `Successfully updated ${data.displayName}` });
          queryClient.invalidateQueries({ queryKey: getGetGovernedValueQueryKey(valueId) });
          queryClient.invalidateQueries({ queryKey: getListGovernedValuesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGovernedValueHistoryQueryKey(valueId) });
          setIsEditing(false);
        },
        onError: (err: any) => {
          toast({ title: "Update Failed", description: err?.response?.data?.error || "Failed to update value", variant: "destructive" });
        }
      });
    }
  };

  const handleTransitionSubmit = () => {
    if (!transitionState.action || !transitionReason.trim()) return;
    if (transitionState.action === "supersede" && !replacementId) return;

    transitionMut.mutate({
      id: valueId,
      data: {
        action: transitionState.action,
        reason: transitionReason,
        replacementId: transitionState.action === "supersede" ? replacementId : null,
        rowVersion: detail!.rowVersion
      }
    }, {
      onSuccess: () => {
        toast({ title: "Status Updated", description: `Successfully transitioned status` });
        queryClient.invalidateQueries({ queryKey: getGetGovernedValueQueryKey(valueId) });
        queryClient.invalidateQueries({ queryKey: getListGovernedValuesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListGovernedValueHistoryQueryKey(valueId) });
        setTransitionState({ open: false, action: null });
        setTransitionReason("");
        setReplacementId("");
      },
      onError: (err: any) => {
        toast({ title: "Transition Failed", description: err?.response?.data?.error || "Failed to transition value", variant: "destructive" });
      }
    });
  };

  const handleAssocSubmit = () => {
    if (!assocToId || !assocType) return;
    assocMut.mutate({
      data: {
        fromValueId: valueId,
        toValueId: assocToId,
        relationshipType: assocType
      }
    }, {
      onSuccess: () => {
        toast({ title: "Association Added", description: "The relationship was successfully created." });
        queryClient.invalidateQueries({ queryKey: getGetGovernedValueQueryKey(valueId) });
        setAssocOpen(false);
        setAssocToId("");
        setAssocType("");
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.response?.data?.error || "Failed to create association", variant: "destructive" });
      }
    });
  };

  const isTransitioning = transitionMut.isPending;
  const isSaving = createMut.isPending || updateMut.isPending;
  const isAddingAssoc = assocMut.isPending;

  return (
    <div className="flex flex-col animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" className="h-9 w-9 border-border bg-background shadow-sm hover:bg-muted" onClick={() => setLocation("/taxonomy")}>
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {isNew ? "Create Governed Value" : detail?.displayName}
            </h1>
            {!isNew && detail && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-muted/30 text-muted-foreground border-border/60">
                  {detail.stableKey}
                </Badge>
                <Badge className="text-[10px] uppercase bg-primary/10 text-primary hover:bg-primary/15 border-primary/20 shadow-none">
                  {detail.status.replace("_", " ")}
                </Badge>
                {detail.usageCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] uppercase bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 border-blue-500/20 shadow-none">
                    Used {detail.usageCount} times
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-2 font-medium">
                  v{detail.taxonomyVersion} • Last updated {format(new Date(detail.updatedAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>
        {!isNew && access.canAdminister && (
          <Button variant="outline" size="sm" onClick={() => setRetentionOpen(true)} className="text-muted-foreground hover:text-foreground">
            <ArchiveX className="mr-2 h-4 w-4" /> Retention policy
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="shadow-sm border-border overflow-hidden">
            <CardHeader className="bg-muted/10 border-b py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Value Details</CardTitle>
                  <CardDescription className="text-xs">Core metadata and taxonomy configuration</CardDescription>
                </div>
                {!isNew && access.canPropose && !isEditing && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit Details</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  {/* Row 1: Immutable Identity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField control={form.control} name="stableKey" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          Stable Key {!isNew && <span className="font-normal lowercase opacity-70">(Immutable)</span>}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isNew || (!isEditing && isNew)} className={cn("font-mono text-sm", !isNew && "bg-muted/30 border-dashed text-muted-foreground")} placeholder="e.g. NA-ENT-23" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {isNew ? (
                      <FormField control={form.control} name="category" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Category</FormLabel>
                          <Select onValueChange={(val) => {
                            field.onChange(val);
                            if (!form.getValues("metadataString")) {
                              form.setValue("metadataString", JSON.stringify(
                                val === "channel"
                                  ? { code: "", source: "", medium: "", type: "", isTargeting: false, features: [] }
                                  : { code: "" },
                                null,
                                2,
                              ));
                            }
                          }} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[300px]">
                              {categories?.map(c => (
                                <SelectItem key={c.key} value={c.key}>{c.displayName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    ) : (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          Category <span className="font-normal lowercase opacity-70">(Immutable)</span>
                        </label>
                        <Input
                          value={activeCategory?.displayName ?? detail?.category.replaceAll("_", " ") ?? ""}
                          disabled
                          className="h-9 bg-muted/30 border-dashed text-muted-foreground"
                        />
                      </div>
                    )}
                  </div>

                  {/* Row 2: Core Data */}
                  <div className="space-y-5">
                    <FormField control={form.control} name="displayName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Display Name</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="definition" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Definition & Usage Rules</FormLabel>
                        <FormControl>
                          <Textarea {...field} disabled={!isEditing} rows={3} className="resize-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 3: Meta & Source */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t">
                    <FormField control={form.control} name="owner" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Owner / Steward</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="source" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">System of Record</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 4: Dates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField control={form.control} name="effectiveStart" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Effective Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={!isEditing} className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="effectiveEnd" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Effective End Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} disabled={!isEditing} className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 5: Version & Legacy */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField control={form.control} name="taxonomyVersion" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Taxonomy Version</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} className="font-mono text-xs h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="legacyCodes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Legacy Codes</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} placeholder="e.g. OLD-123, LEG-456" className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 6: Conditional Fields */}
                  {(supportsParent || supportsMeasurementRule) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t">
                      {supportsParent && (
                        <FormField control={form.control} name="parentId" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                              Parent Value {expectedParentCategory && <span className="lowercase opacity-80 font-normal">({expectedParentCategory.replace('_', ' ')})</span>}
                            </FormLabel>
                            <Select disabled={!isEditing} onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none"}>
                              <FormControl>
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder={isLoadingParents ? "Loading..." : "No parent selected"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[300px]">
                                <SelectItem value="none">No parent selected</SelectItem>
                                {parentCandidates?.filter(v => v.id !== valueId).map(v => (
                                  <SelectItem key={v.id} value={v.id}>{v.displayName} ({v.stableKey})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                      {supportsMeasurementRule && (
                        <FormField control={form.control} name="measurementRule" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Measurement Rule</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled={!isEditing} placeholder="e.g. SQL where clause or logic" className="h-9 font-mono text-xs" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                    </div>
                  )}

                  {/* Row 7: Metadata Editor */}
                  <div className="pt-4 border-t">
                    <FormField control={form.control} name="metadataString" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Metadata Properties (JSON)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            disabled={!isEditing}
                            rows={8}
                            className="font-mono text-xs leading-relaxed bg-muted/10 border-muted"
                            placeholder={'{\n  "code": "VALUE"\n}'}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Structured key-value properties. Must be a valid JSON object. Unknown keys will be preserved.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {isEditing && (
                    <div className="flex justify-end gap-3 pt-6 border-t mt-8">
                      {!isNew && (
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setIsEditing(false);
                          form.reset();
                        }}>
                          Cancel
                        </Button>
                      )}
                      <Button type="submit" size="sm" disabled={isSaving}>
                        {isSaving && <Activity className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        <Save className="mr-2 h-3.5 w-3.5" />
                        {isNew ? "Create Value" : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          {!isNew && detail && (
            <Card className="shadow-sm border-border overflow-hidden">
              <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between py-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold m-0">
                  <LinkIcon className="h-4 w-4 text-primary" />
                  Taxonomy Associations
                </CardTitle>
                {access.canPropose && (
                  <Button size="sm" variant="outline" onClick={() => setAssocOpen(true)} className="h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Target
                  </Button>
                )}
              </CardHeader>
              <div className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/5 hover:bg-muted/5 border-b border-border">
                      <TableHead className="text-xs font-semibold h-9">Target Value</TableHead>
                      <TableHead className="text-xs font-semibold h-9">Relationship Type</TableHead>
                      <TableHead className="text-xs font-semibold h-9 text-right pr-6">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.associations && detail.associations.length > 0 ? (
                      detail.associations.map(assoc => (
                        <TableRow key={assoc.id} className="hover:bg-muted/5">
                          <TableCell className="text-sm font-medium py-2">
                            {(() => {
                              const otherId = assoc.fromValueId === valueId ? assoc.toValueId : assoc.fromValueId;
                              const other = allActiveValues?.find((value) => value.id === otherId);
                              return other ? `${other.displayName} (${other.stableKey})` : otherId;
                            })()}
                          </TableCell>
                          <TableCell className="py-2"><Badge variant="secondary" className="text-[10px] h-5 px-1.5 py-0 font-medium bg-muted text-muted-foreground hover:bg-muted shadow-none border-none">{assoc.relationshipType}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2 text-right pr-6">{format(new Date(assoc.createdAt), "MMM d, yyyy")}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-20 text-center text-xs text-muted-foreground">
                          No associations currently defined.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {!isNew && detail && (
            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/10 border-b py-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Lifecycle Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Status</span>
                  <p className="text-sm text-foreground font-medium">
                    This value is currently <span className="capitalize">{detail.status.replace("_", " ")}</span>.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t">
                  {detail.status === "draft" && access.canPropose && (
                    <Button variant="outline" size="sm" className="w-full justify-start font-medium border-amber-500/30 text-amber-700 bg-amber-50/50 hover:bg-amber-100/50 dark:text-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/20" onClick={() => setTransitionState({ open: true, action: "submit_review" })}>
                      <AlertCircle className="mr-2 h-3.5 w-3.5" /> Submit for Review
                    </Button>
                  )}
                  {detail.status === "in_review" && access.canReview && (
                    <Button variant="outline" size="sm" className="w-full justify-start font-medium border-blue-500/30 text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 dark:text-blue-400 dark:bg-blue-500/10 dark:hover:bg-blue-500/20" onClick={() => setTransitionState({ open: true, action: "approve" })}>
                      <ShieldCheck className="mr-2 h-3.5 w-3.5" /> Approve Value
                    </Button>
                  )}
                  {detail.status === "approved" && access.canActivate && (
                    <Button variant="default" size="sm" className="w-full justify-start font-medium" onClick={() => setTransitionState({ open: true, action: "activate" })}>
                      <PlayCircle className="mr-2 h-3.5 w-3.5" /> Activate Value
                    </Button>
                  )}
                  {detail.status === "active" && access.canActivate && (
                    <>
                      <Button variant="outline" size="sm" className="w-full justify-start font-medium" onClick={() => setTransitionState({ open: true, action: "supersede" })}>
                        <ArrowLeft className="mr-2 h-3.5 w-3.5 text-indigo-500 rotate-180" /> Supersede Value
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start font-medium border-red-500/30 text-red-700 bg-red-50/50 hover:bg-red-100/50 hover:text-red-800 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20" onClick={() => setTransitionState({ open: true, action: "retire" })}>
                        <ArchiveX className="mr-2 h-3.5 w-3.5" /> Retire Value
                      </Button>
                    </>
                  )}
                  {detail.status === "inactive" && access.canActivate && (
                    <Button variant="outline" size="sm" className="w-full justify-start font-medium" onClick={() => setTransitionState({ open: true, action: "activate" })}>
                      <PlayCircle className="mr-2 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Reactivate Value
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {!isNew && (
            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/10 border-b py-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-primary" />
                  Audit History
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="space-y-4">
                  {history?.slice(0, 8).map(evt => (
                    <div key={evt.id} className="flex flex-col gap-1 text-sm border-b border-border/50 last:border-0 pb-3 last:pb-0">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-foreground capitalize">{evt.action.replace(/_/g, " ")}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(evt.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs font-medium">
                        by {evt.actorLabel}
                      </div>
                      {evt.reason && (
                        <div className="mt-1.5 p-2.5 bg-muted/30 border border-muted rounded-md text-xs text-muted-foreground">
                          {evt.reason}
                        </div>
                      )}
                    </div>
                  ))}
                  {history?.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No history recorded yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={transitionState.open} onOpenChange={(open) => !open && setTransitionState({ open: false, action: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Transition</DialogTitle>
            <DialogDescription>
              Provide a reason for changing the governance status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter justification..."
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                rows={3}
              />
            </div>
            {transitionState.action === "supersede" && (
              <div className="space-y-2">
                <Label htmlFor="replacementId" className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Replacement Value</Label>
                <Select value={replacementId} onValueChange={setReplacementId}>
                  <SelectTrigger id="replacementId">
                    <SelectValue placeholder="Select a replacement" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {allActiveValues?.filter(v => v.category === detail?.category && v.id !== valueId).map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.displayName} ({v.stableKey})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionState({ open: false, action: null })} disabled={isTransitioning}>Cancel</Button>
            <Button onClick={handleTransitionSubmit} disabled={!transitionReason.trim() || (transitionState.action === "supersede" && !replacementId) || isTransitioning}>
              {isTransitioning && <Activity className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Status Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assocOpen} onOpenChange={setAssocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Association</DialogTitle>
            <DialogDescription>
              Create a directional relationship between taxonomy values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Target Value</Label>
              <Select value={assocToId} onValueChange={setAssocToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {allActiveValues?.filter(v => v.id !== valueId).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.displayName} ({v.stableKey})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Relationship Type</Label>
              <Input 
                value={assocType} 
                onChange={(e) => setAssocType(e.target.value)} 
                placeholder="e.g. requires, excludes, defaults_to"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssocOpen(false)} disabled={isAddingAssoc}>Cancel</Button>
            <Button onClick={handleAssocSubmit} disabled={!assocToId || !assocType || isAddingAssoc}>
              {isAddingAssoc && <Activity className="mr-2 h-4 w-4 animate-spin" />}
              Create Association
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TaxonomyDetail() {
  return (
    <TaxonomyGuard>
      <TaxonomyDetailContent />
    </TaxonomyGuard>
  );
}
