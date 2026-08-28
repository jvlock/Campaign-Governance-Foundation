import { useState } from "react";
import { 
  useListTaxonomyImports, 
  useCreateTaxonomyImportPreview,
  useListTaxonomyImportConflicts,
  useResolveTaxonomyImportConflict,
  useListGovernedValues,
  getListTaxonomyImportsQueryKey,
  getListTaxonomyImportConflictsQueryKey
} from "@workspace/api-client-react";
import type { TaxonomyImportPreviewInputSourceFile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  FileDown,
  FileCode,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaxonomyGuard, useTaxonomyAccess } from "@/components/taxonomy/taxonomy-guard";
import { TaxonomyHeader } from "@/components/taxonomy/taxonomy-header";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function TaxonomyImportsContent() {
  const access = useTaxonomyAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  
  // Conflict resolution dialog state
  const [resolveDialog, setResolveDialog] = useState<{ isOpen: boolean, conflictId: string | null, action: "resolved" | "ignored" | null }>({
    isOpen: false,
    conflictId: null,
    action: null
  });
  const [resolutionText, setResolutionText] = useState("");
  const [resolutionDecision, setResolutionDecision] = useState<"map_to_governed_value" | "not_applicable" | "ignore_source">("not_applicable");
  const [targetValueId, setTargetValueId] = useState("");

  const { data: batches, isLoading: isLoadingBatches } = useListTaxonomyImports();
  const { data: governedValues } = useListGovernedValues();
  const { data: conflicts, isLoading: isLoadingConflicts } = useListTaxonomyImportConflicts(
    selectedBatchId || "",
    { query: { enabled: !!selectedBatchId, queryKey: getListTaxonomyImportConflictsQueryKey(selectedBatchId || "") } }
  );
  
  const createPreview = useCreateTaxonomyImportPreview();
  const resolveConflict = useResolveTaxonomyImportConflict();

  const handleGeneratePreview = (sourceFile: TaxonomyImportPreviewInputSourceFile) => {
    createPreview.mutate({
      data: { sourceFile }
    }, {
      onSuccess: () => {
        toast({ title: "Preview Generated", description: `Successfully processed ${sourceFile.replace("_", " ")}` });
        queryClient.invalidateQueries({ queryKey: getListTaxonomyImportsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Preview Failed", description: err?.response?.data?.error || "Could not generate preview", variant: "destructive" });
      }
    });
  };

  const handleResolveSubmit = () => {
    if (!resolveDialog.conflictId || !resolveDialog.action || !resolutionText.trim()) return;

    resolveConflict.mutate({
      id: resolveDialog.conflictId,
      data: {
        status: resolveDialog.action,
          resolution: resolutionText,
          resolutionDecision,
          targetValueId: resolutionDecision === "map_to_governed_value" ? targetValueId : null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Conflict Updated", description: `Conflict marked as ${resolveDialog.action}` });
        queryClient.invalidateQueries({ queryKey: getListTaxonomyImportConflictsQueryKey(selectedBatchId || "") });
        queryClient.invalidateQueries({ queryKey: getListTaxonomyImportsQueryKey() });
        setResolveDialog({ isOpen: false, conflictId: null, action: null });
        setResolutionText("");
        setTargetValueId("");
      },
      onError: (err: any) => {
        toast({ title: "Update Failed", description: err?.response?.data?.error || "Failed to resolve conflict", variant: "destructive" });
      }
    });
  };

  if (selectedBatchId) {
    const batch = batches?.find(b => b.id === selectedBatchId);
    return (
      <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setSelectedBatchId(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Import Batch Preview
            </h1>
            {batch && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                <span className="font-mono text-xs">{batch.id}</span>
                <span>•</span>
                <span>{batch.sourceFile}</span>
                <span>•</span>
                <span>{format(new Date(batch.createdAt), "MMM d, yyyy HH:mm")}</span>
              </p>
            )}
          </div>
        </div>

        <Card className="shadow-sm overflow-hidden border-border">
          <CardHeader className="bg-muted/10 border-b pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Detected Conflicts</span>
              {batch && (
                <Badge variant="outline" className="font-mono">
                  {conflicts?.filter(c => c.status === "open").length || 0} Open / {batch.conflictCount} Total
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <div className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/5 hover:bg-muted/5">
                  <TableHead className="pl-6 w-[200px]">Source Value</TableHead>
                  <TableHead className="w-[160px]">Conflict Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[160px] text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingConflicts ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-6"><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell className="pr-6"><Skeleton className="h-8 w-24 ml-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : conflicts && conflicts.length > 0 ? (
                  conflicts.map((conflict) => (
                    <TableRow key={conflict.id}>
                      <TableCell className="pl-6 font-medium text-sm">
                        {conflict.sourceValue}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                          {conflict.conflictType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {conflict.details}
                        {conflict.resolution && (
                          <div className="mt-1 text-xs font-medium text-foreground bg-muted/50 p-1.5 rounded inline-block">
                            Resolution: {conflict.resolution}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "capitalize px-2 py-0.5 h-6 font-medium shadow-none",
                          conflict.status === 'resolved' ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" :
                          conflict.status === 'ignored' ? "bg-muted text-muted-foreground" :
                          "bg-amber-500/10 text-amber-700 border-amber-500/20"
                        )}>
                          {conflict.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {conflict.status === "open" ? (
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-xs px-2"
                              onClick={() => {
                                setResolveDialog({ isOpen: true, conflictId: conflict.id, action: "ignored" });
                                setResolutionText("");
                                setResolutionDecision("ignore_source");
                                setTargetValueId("");
                              }}
                            >
                              Ignore
                            </Button>
                            <Button 
                              size="sm" 
                              className="h-7 text-xs px-2"
                              onClick={() => {
                                setResolveDialog({ isOpen: true, conflictId: conflict.id, action: "resolved" });
                                setResolutionText("");
                                setResolutionDecision("not_applicable");
                                setTargetValueId("");
                              }}
                            >
                              Resolve
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No conflicts found in this batch.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Resolution Dialog */}
        <Dialog open={resolveDialog.isOpen} onOpenChange={(open) => !open && setResolveDialog(prev => ({...prev, isOpen: false}))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {resolveDialog.action === "resolved" ? "Resolve Conflict" : "Ignore Conflict"}
              </DialogTitle>
              <DialogDescription>
                Please provide a reason or summary of how this conflict is being handled. This resolution text is required for the audit log.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Explicit decision</Label>
                <Select value={resolutionDecision} onValueChange={(value) => {
                  setResolutionDecision(value as typeof resolutionDecision);
                  if (value !== "map_to_governed_value") setTargetValueId("");
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {resolveDialog.action === "resolved" ? (
                      <>
                        <SelectItem value="map_to_governed_value">Map to a governed value</SelectItem>
                        <SelectItem value="not_applicable">Mark as not applicable</SelectItem>
                      </>
                    ) : (
                      <SelectItem value="ignore_source">Ignore this source candidate</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {resolutionDecision === "map_to_governed_value" && (
                <div className="space-y-2">
                  <Label>Governed target</Label>
                  <Select value={targetValueId} onValueChange={setTargetValueId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select the explicit target" />
                    </SelectTrigger>
                    <SelectContent>
                      {governedValues?.map((value) => (
                        <SelectItem key={value.id} value={value.id}>
                          {value.displayName} ({value.stableKey})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Resolution Notes</Label>
                <Textarea 
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  placeholder={resolveDialog.action === "resolved" ? "e.g. Mapped to existing governed value 'ENT-001'" : "e.g. Extraneous legacy artifact, skipping"}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveDialog({ isOpen: false, conflictId: null, action: null })}>Cancel</Button>
              <Button onClick={handleResolveSubmit} disabled={resolveConflict.isPending || !resolutionText.trim() || (resolutionDecision === "map_to_governed_value" && !targetValueId)}>
                {resolveConflict.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Resolution
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <TaxonomyHeader />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="col-span-1 lg:col-span-2 shadow-sm border-border bg-gradient-to-br from-card to-muted/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              Preview Preserved Source
            </CardTitle>
            <CardDescription>
              Select preserved legacy taxonomy or UTM sources to generate a conflict preview against the governed foundation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                variant="outline" 
                className="h-24 flex-col gap-2 bg-background hover:bg-muted w-full sm:w-40"
                onClick={() => handleGeneratePreview("segments_workbook")}
                disabled={createPreview.isPending}
              >
                <FileDown className="h-6 w-6 text-blue-500" />
                Segments V2
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex-col gap-2 bg-background hover:bg-muted w-full sm:w-40"
                onClick={() => handleGeneratePreview("taxonomy_workbook")}
                disabled={createPreview.isPending}
              >
                <FileDown className="h-6 w-6 text-emerald-500" />
                Global Tax 23
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex-col gap-2 bg-background hover:bg-muted w-full sm:w-40"
                onClick={() => handleGeneratePreview("utm_html")}
                disabled={createPreview.isPending}
              >
                <FileCode className="h-6 w-6 text-purple-500" />
                UTM HTML
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardHeader className="bg-muted/10 border-b">
            <CardTitle className="text-base">Conflict Resolution Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Detected conflicts
                </span>
                <span className="font-bold">
                  {batches?.reduce((acc, b) => acc + (b.status === "preview" ? b.conflictCount : 0), 0) || 0}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Resolved
                </span>
                <span className="font-bold">
                  {batches?.filter(b => b.status === "reviewed" || b.status === "applied").length || 0} batches
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-border">
        <CardHeader className="bg-muted/10 border-b pb-4">
          <CardTitle>Recent Import Batches</CardTitle>
        </CardHeader>
        <div className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/5 hover:bg-muted/5">
                <TableHead className="w-[180px] pl-6">Batch ID</TableHead>
                <TableHead>Source File</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Candidates</TableHead>
                <TableHead className="text-center">Conflicts</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[80px] pr-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingBatches ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6"><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : batches && batches.length > 0 ? (
                batches.map((batch) => (
                  <TableRow 
                    key={batch.id} 
                    className="group cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground pl-6">
                      {batch.id.split("-")[0]}...
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {batch.sourceFile}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(batch.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {batch.candidateCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {batch.conflictCount > 0 ? (
                        <Badge variant="destructive" className="font-mono">{batch.conflictCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground font-mono text-sm">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "capitalize px-2 py-0.5 h-6 font-medium shadow-none",
                        batch.status === 'applied' ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" :
                        batch.status === 'preview' ? "bg-amber-500/10 text-amber-700 border-amber-500/20" :
                        "bg-blue-500/10 text-blue-700 border-blue-500/20"
                      )}>
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No import batches found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

export default function TaxonomyImports() {
  return (
    <TaxonomyGuard>
      <TaxonomyImportsContent />
    </TaxonomyGuard>
  );
}
