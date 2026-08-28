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
import type { GovernanceStatus, TaxonomyCategoryKey, GovernanceTransitionInputAction } from "@workspace/api-client-react";

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
  ArrowLeft, Save, ShieldCheck, History, Activity, AlertCircle, PlayCircle, ArchiveX, AlertTriangle, Link as LinkIcon, Plus,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const valueSchema = z.object({
  stableKey: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Alphanumeric, dashes, and underscores only"),
  category: z.string().min(1),
  displayName: z.string().min(1).max(100),
  definition: z.string().min(1),
  effectiveStart: z.string().min(1),
  effectiveEnd: z.string().optional().nullable(),
  taxonomyVersion: z.string().min(1, "Taxonomy version is required"),
  source: z.string().min(1, "System of record is required"),
  owner: z.string().min(1, "Owner is required"),
  legacyCodes: z.string().optional(),
  parentId: z.string().optional().nullable(),
  measurementRule: z.string().optional().nullable(),
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

  // Dialog States
  const [transitionState, setTransitionState] = useState<{ open: boolean, action: GovernanceTransitionInputAction | null }>({ open: false, action: null });
  const [transitionReason, setTransitionReason] = useState("");
  const [replacementId, setReplacementId] = useState("");
  
  const [retentionOpen, setRetentionOpen] = useState(false);
  
  const [assocOpen, setAssocOpen] = useState(false);
  const [assocToId, setAssocToId] = useState("");
  const [assocType, setAssocType] = useState("");

  const { data: categories } = useListTaxonomyCategories();
  const { data: activeValues } = useListGovernedValues(
    { status: "active" },
    { query: { enabled: !isNew, queryKey: getListGovernedValuesQueryKey({ status: "active" }) } },
  );
  
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
    }
  });

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
      });
    }
  }, [detail, isNew, form]);

  const activeCategory = categories?.find(c => c.key === form.watch("category"));
  const supportsParent = activeCategory?.supportsParent ?? false;
  const supportsMeasurementRule = activeCategory?.supportsMeasurementRule ?? false;

  if (!isNew && isLoadingDetail) {
    return <div className="p-8"><Skeleton className="h-[600px] w-full" /></div>;
  }

  if (!isNew && isError) {
    return <div className="p-8 text-destructive">Failed to load value. It may have been deleted or you lack permissions.</div>;
  }

  const onSubmit = (data: ValueFormValues) => {
    const legacyArray = data.legacyCodes ? data.legacyCodes.split(',').map(s=>s.trim()).filter(Boolean) : [];
    
    if (isNew) {
      createMut.mutate({
        data: {
          ...data,
          category: data.category as TaxonomyCategoryKey,
          effectiveEnd: data.effectiveEnd || null,
          parentId: supportsParent ? (data.parentId || null) : null,
          measurementRule: supportsMeasurementRule ? (data.measurementRule || null) : null,
          legacyCodes: legacyArray
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
          ...data,
          rowVersion: detail!.rowVersion,
          effectiveEnd: data.effectiveEnd || null,
          parentId: supportsParent ? (data.parentId || null) : null,
          measurementRule: supportsMeasurementRule ? (data.measurementRule || null) : null,
          legacyCodes: legacyArray
        }
      }, {
        onSuccess: (res) => {
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
        toast({ title: "Status Updated", description: `Successfully transitioned to ${transitionState.action}` });
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
          <Button variant="ghost" size="icon" onClick={() => setLocation("/taxonomy")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? "Create Governed Value" : detail?.displayName}
            </h1>
            {!isNew && detail && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono bg-muted/50">{detail.stableKey}</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {detail.status.replace("_", " ").toUpperCase()}
                </Badge>
                {detail.usageCount > 0 && (
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 border-blue-500/20">
                    Used {detail.usageCount} times
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-2">
                  v{detail.taxonomyVersion} • Last updated {format(new Date(detail.updatedAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>
        {!isNew && access.canAdminister && (
          <Button variant="outline" onClick={() => setRetentionOpen(true)}>
            <ArchiveX className="mr-2 h-4 w-4" /> Retention policy
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="bg-muted/10 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Value Details</CardTitle>
                  <CardDescription>Core metadata for this taxonomy value</CardDescription>
                </div>
                {!isNew && access.canPropose && !isEditing && (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>Edit Details</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  {/* Row 1: Immutable Identity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="stableKey" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stable Key {!isNew && <span className="text-muted-foreground font-normal">(Immutable)</span>}</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isNew || (!isEditing && isNew)} className={cn("font-mono text-sm", !isNew && "bg-muted/50 cursor-not-allowed")} placeholder="e.g. NA-ENT-23" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category {!isNew && <span className="text-muted-foreground font-normal">(Immutable)</span>}</FormLabel>
                        <Select disabled={!isNew || (!isEditing && isNew)} onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={cn(!isNew && "bg-muted/50 cursor-not-allowed text-muted-foreground")}>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories?.map(c => (
                              <SelectItem key={c.key} value={c.key}>{c.displayName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 2: Core Data */}
                  <FormField control={form.control} name="displayName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="definition" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Definition & Usage Rules</FormLabel>
                      <FormControl>
                        <Textarea {...field} disabled={!isEditing} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Row 3: Meta & Source */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                    <FormField control={form.control} name="owner" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner / Steward</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="source" render={({ field }) => (
                      <FormItem>
                        <FormLabel>System of Record (Source)</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 4: Dates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="effectiveStart" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="effectiveEnd" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective End Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 5: Version & Legacy */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="taxonomyVersion" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taxonomy Version</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} className="font-mono text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="legacyCodes" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legacy Codes (Comma separated)</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={!isEditing} placeholder="e.g. OLD-123, LEG-456" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Row 6: Conditional Fields */}
                  {(supportsParent || supportsMeasurementRule) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                      {supportsParent && (
                        <FormField control={form.control} name="parentId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Parent Value</FormLabel>
                            <Select disabled={!isEditing} onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none"}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="No parent selected" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No parent selected</SelectItem>
                                {activeValues?.filter(v => v.id !== valueId).map(v => (
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
                            <FormLabel>Measurement Rule</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled={!isEditing} placeholder="e.g. SQL where clause or logic" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div className="flex justify-end gap-3 pt-6 border-t">
                      {!isNew && (
                        <Button type="button" variant="outline" onClick={() => {
                          setIsEditing(false);
                          form.reset();
                        }}>
                          Cancel
                        </Button>
                      )}
                      <Button type="submit" disabled={isSaving}>
                        {isSaving && <Activity className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        {isNew ? "Create Value" : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          {!isNew && detail && (
            <Card className="shadow-sm">
              <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between py-4">
                <CardTitle className="flex items-center gap-2 text-base m-0">
                  <LinkIcon className="h-4 w-4 text-primary" />
                  Taxonomy Associations
                </CardTitle>
                {access.canPropose && (
                  <Button size="sm" variant="outline" onClick={() => setAssocOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                )}
              </CardHeader>
              <div className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/5">
                      <TableHead>Target Value ID</TableHead>
                      <TableHead>Relationship Type</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.associations && detail.associations.length > 0 ? (
                      detail.associations.map(assoc => (
                        <TableRow key={assoc.id}>
                          <TableCell className="text-sm">
                            {(() => {
                              const otherId = assoc.fromValueId === valueId ? assoc.toValueId : assoc.fromValueId;
                              const other = activeValues?.find((value) => value.id === otherId);
                              return other ? `${other.displayName} (${other.stableKey})` : otherId;
                            })()}
                          </TableCell>
                          <TableCell><Badge variant="secondary">{assoc.relationshipType}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(assoc.createdAt), "MMM d, yyyy")}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
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
            <Card className="shadow-sm">
              <CardHeader className="bg-muted/10 border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Lifecycle Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-1">
                  <span className="text-sm font-medium">Current Status</span>
                  <p className="text-sm text-muted-foreground">
                    This value is currently <strong className="text-foreground">{detail.status.replace("_", " ")}</strong>.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t">
                  {detail.status === "draft" && access.canPropose && (
                    <Button variant="outline" className="w-full justify-start" onClick={() => setTransitionState({ open: true, action: "submit_review" })}>
                      <AlertCircle className="mr-2 h-4 w-4 text-amber-500" /> Submit for Review
                    </Button>
                  )}
                  {detail.status === "in_review" && access.canReview && (
                    <Button variant="outline" className="w-full justify-start" onClick={() => setTransitionState({ open: true, action: "approve" })}>
                      <ShieldCheck className="mr-2 h-4 w-4 text-blue-500" /> Approve Value
                    </Button>
                  )}
                  {detail.status === "approved" && access.canActivate && (
                    <Button variant="default" className="w-full justify-start bg-emerald-600 hover:bg-emerald-700" onClick={() => setTransitionState({ open: true, action: "activate" })}>
                      <PlayCircle className="mr-2 h-4 w-4" /> Activate
                    </Button>
                  )}
                  {detail.status === "active" && access.canActivate && (
                    <>
                      <Button variant="outline" className="w-full justify-start" onClick={() => setTransitionState({ open: true, action: "supersede" })}>
                        <ArrowLeft className="mr-2 h-4 w-4 text-indigo-500 rotate-180" /> Supersede Value
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => setTransitionState({ open: true, action: "retire" })}>
                        <ArchiveX className="mr-2 h-4 w-4" /> Retire Value
                      </Button>
                    </>
                  )}
                  {detail.status === "inactive" && access.canActivate && (
                    <Button variant="outline" className="w-full justify-start" onClick={() => setTransitionState({ open: true, action: "activate" })}>
                      <PlayCircle className="mr-2 h-4 w-4 text-emerald-500" /> Reactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {!isNew && (
            <Card className="shadow-sm">
              <CardHeader className="bg-muted/10 border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-primary" />
                  Audit History
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {history?.slice(0, 8).map(evt => (
                    <div key={evt.id} className="flex flex-col gap-1 text-sm border-b last:border-0 pb-3 last:pb-0">
                      <div className="flex justify-between items-start">
                        <span className="font-medium capitalize">{evt.action.replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(evt.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        by {evt.actorLabel}
                      </div>
                      {evt.reason && (
                        <div className="mt-1.5 p-2 bg-muted/40 border border-muted rounded-md text-xs italic text-muted-foreground">
                          "{evt.reason}"
                        </div>
                      )}
                    </div>
                  ))}
                  {history?.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No history recorded yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Transition Dialog */}
      <Dialog open={transitionState.open} onOpenChange={(open) => !open && setTransitionState({ open: false, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {transitionState.action?.replace(/_/g, " ")} Value
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for this lifecycle change. This will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {transitionState.action === "supersede" && (
              <div className="space-y-2">
                <Label>Replacement Value</Label>
                <Select value={replacementId} onValueChange={setReplacementId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select active value to supersede this one" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeValues?.filter(v => v.id !== valueId && v.category === detail?.category).map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.displayName} ({v.stableKey})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason / Justification</Label>
              <Textarea 
                value={transitionReason} 
                onChange={(e) => setTransitionReason(e.target.value)} 
                placeholder="e.g. Approved by taxonomy council meeting on 10/24"
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionState({ open: false, action: null })}>Cancel</Button>
            <Button onClick={handleTransitionSubmit} disabled={isTransitioning || !transitionReason.trim() || (transitionState.action === "supersede" && !replacementId)}>
              {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {transitionState.action?.split('_')[0]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retention policy */}
      <Dialog open={retentionOpen} onOpenChange={setRetentionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Governed value retention
            </DialogTitle>
            <DialogDescription>
              Stable taxonomy history is preserved for auditability and downstream references.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">{detail?.displayName}</strong> cannot be permanently deleted.
            {detail?.usageCount ? ` It currently has ${detail.usageCount} recorded uses.` : " It is retained even before its first use so its audit history remains intact."}
            {" "}Use the lifecycle controls to retire or supersede it instead.
          </div>
          <DialogFooter>
            <Button onClick={() => setRetentionOpen(false)}>Understood</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Association Dialog */}
      <Dialog open={assocOpen} onOpenChange={setAssocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Association</DialogTitle>
            <DialogDescription>Link this value to another governed value to build hierarchies or relationships.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Select value={assocToId} onValueChange={setAssocToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target value" />
                </SelectTrigger>
                <SelectContent>
                  {activeValues?.filter(v => v.id !== valueId).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.displayName} ({v.stableKey})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Input 
                value={assocType} 
                onChange={(e) => setAssocType(e.target.value)} 
                placeholder="e.g. related_to, depends_on, alternate_for" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssocOpen(false)}>Cancel</Button>
            <Button onClick={handleAssocSubmit} disabled={isAddingAssoc || !assocToId || !assocType.trim()}>
              {isAddingAssoc && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
