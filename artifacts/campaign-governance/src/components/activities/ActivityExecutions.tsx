import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActivityExecutions,
  getListActivityExecutionsQueryKey,
  useCopyActivityExecution,
  useVersionActivityExecution,
  useUpdateActivityExecution,
  useListDeliveryPlatformConnections,
  getListDeliveryPlatformConnectionsQueryKey,
  usePreviewActivityExecutionPublish,
  usePublishActivityExecution,
  useListExecutionPublishAttempts,
  getListExecutionPublishAttemptsQueryKey,
  type ActivityExecution,
  type CampaignActivityDetail
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreateExecutionDialog } from "./CreateExecutionDialog";
import { Loader2, Copy, GitBranch, FileImage, Edit3, Send, CheckCircle2, AlertTriangle, Eye, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ActivityExecutions({ activity }: { activity: CampaignActivityDetail }) {
  const activityId = activity.id;
  const { data: executions, isLoading } = useListActivityExecutions(activityId, {
    query: { queryKey: getListActivityExecutionsQueryKey(activityId) }
  });

  return (
    <div className="bg-card border rounded-md shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="p-3 border-b flex justify-between items-center bg-muted/10">
        <h5 className="font-semibold text-sm">Lineage & Executions</h5>
        <CreateExecutionDialog activity={activity} />
      </div>
      
      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !executions || executions.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground italic bg-background">No executions recorded yet. Create one to begin.</div>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label="Activity executions" tabIndex={0}>
          <table className="w-full min-w-[900px] text-sm text-left bg-background">
            <thead className="bg-muted/5 text-xs uppercase tracking-wider text-muted-foreground border-b font-bold">
              <tr>
                <th className="px-4 py-3">Variant Key</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Lineage</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {executions.map(ex => <ExecutionRow key={ex.executionKey} execution={ex} activityId={activityId} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExecutionRow({ execution, activityId }: { execution: ActivityExecution, activityId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const copyMutation = useCopyActivityExecution();
  const versionMutation = useVersionActivityExecution();

  const handleCopy = async () => {
    try {
      await copyMutation.mutateAsync({ 
        executionKey: execution.executionKey, 
        data: { name: execution.name + " (Copy)" } 
      });
      queryClient.invalidateQueries({ queryKey: getListActivityExecutionsQueryKey(activityId) });
      toast({ title: "Execution copied" });
    } catch (e: any) {
      toast({ title: "Copy failed", description: e.message, variant: "destructive" });
    }
  };

  const handleVersion = async () => {
    try {
      await versionMutation.mutateAsync({ 
        executionKey: execution.executionKey, 
        data: { name: execution.name } 
      });
      queryClient.invalidateQueries({ queryKey: getListActivityExecutionsQueryKey(activityId) });
      toast({ title: "New version created" });
    } catch (e: any) {
      toast({ title: "Versioning failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <tr className="hover:bg-muted/5 transition-colors group">
      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground font-bold tracking-tight">{execution.executionKey}</td>
      <td className="px-4 py-3 font-semibold">{execution.name}</td>
      <td className="px-4 py-3">
        <Badge variant={execution.status?.toLowerCase() === 'active' ? 'default' : 'outline'} className="text-[10px] uppercase">
          {execution.status || 'Draft'}
        </Badge>
      </td>
      <td className="px-4 py-3 font-mono text-xs bg-muted/20 w-16 text-center border-x">v{execution.versionNumber}</td>
      <td className="px-4 py-3 text-xs">
        {execution.copiedFromExecutionKey ? (
          <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 w-fit">
            <Copy className="w-3 h-3" /> Copied
          </span>
        ) : execution.previousVersionExecutionKey ? (
          <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 w-fit">
            <GitBranch className="w-3 h-3" /> v{execution.versionNumber - 1}
          </span>
        ) : (
          <span className="text-muted-foreground italic">Original</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FileImage className="w-3.5 h-3.5" /> {execution.assetIds?.length ?? 0} assets
        </div>
        <SyncStatus execution={execution} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleCopy} disabled={copyMutation.isPending}>
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleVersion} disabled={versionMutation.isPending}>
            <GitBranch className="w-3.5 h-3.5 mr-1" /> Branch
          </Button>
          <PublishExecutionDialog execution={execution} activityId={activityId} />
          <EditExecutionDialog execution={execution} activityId={activityId} />
        </div>
      </td>
    </tr>
  );
}

function SyncStatus({ execution }: { execution: ActivityExecution }) {
  if (execution.syncState === "published") {
    return <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Published</span>;
  }
  if (execution.syncState === "failed") {
    return <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="w-3.5 h-3.5" /> Failed</span>;
  }
  if (execution.syncState === "publishing") {
    return <span className="flex items-center gap-1 text-blue-700"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing</span>;
  }
  return <span className="text-muted-foreground opacity-60">Not published</span>;
}

function PublishExecutionDialog({ execution, activityId }: { execution: ActivityExecution, activityId: string }) {
  const [open, setOpen] = useState(false);
  const [platformConnectionId, setPlatformConnectionId] = useState("");
  const [previewPayload, setPreviewPayload] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: connections, isLoading } = useListDeliveryPlatformConnections(
    { activityId },
    { query: { enabled: open, queryKey: getListDeliveryPlatformConnectionsQueryKey({ activityId }) } },
  );
  const { data: attempts } = useListExecutionPublishAttempts(execution.executionKey, {
    query: { enabled: open, queryKey: getListExecutionPublishAttemptsQueryKey(execution.executionKey) },
  });
  const previewMutation = usePreviewActivityExecutionPublish();
  const publishMutation = usePublishActivityExecution();
  const activeConnections = connections?.filter((connection) => connection.isActive) ?? [];
  const isApproved = execution.status?.toLowerCase() === "approved";

  const preview = async () => {
    try {
      const result = await previewMutation.mutateAsync({
        executionKey: execution.executionKey,
        data: { platformConnectionId },
      });
      setPreviewPayload(result.payload);
      await queryClient.invalidateQueries({
        queryKey: getListExecutionPublishAttemptsQueryKey(execution.executionKey),
      });
      toast({ title: "Preview validated", description: "Nothing was sent to the delivery platform." });
    } catch (error: any) {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    }
  };

  const publish = async () => {
    try {
      const result = await publishMutation.mutateAsync({
        executionKey: execution.executionKey,
        data: { platformConnectionId },
      });
      await queryClient.invalidateQueries({ queryKey: getListActivityExecutionsQueryKey(activityId) });
      toast({
        title: result.mode === "idempotent" ? "Already published" : "Execution published",
        description: result.externalId ? `External ID: ${result.externalId}` : undefined,
      });
      setOpen(false);
    } catch (error: any) {
      await queryClient.invalidateQueries({ queryKey: getListActivityExecutionsQueryKey(activityId) });
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setPreviewPayload(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2">
          <Send className="w-3.5 h-3.5 mr-1" /> Publish
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish execution</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!isApproved && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Approval required</AlertTitle>
              <AlertDescription>Only executions with Approved status can be previewed or published.</AlertDescription>
            </Alert>
          )}
          {execution.lastSyncError && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Last publish failed</AlertTitle>
              <AlertDescription>{execution.lastSyncError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Delivery platform</Label>
            <Select value={platformConnectionId} onValueChange={(value) => { setPlatformConnectionId(value); setPreviewPayload(null); }}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading platforms..." : "Select an active platform"} />
              </SelectTrigger>
              <SelectContent>
                {activeConnections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id}>{connection.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && activeConnections.length === 0 && (
              <p className="text-xs text-muted-foreground">An administrator must activate a delivery platform for this governed channel.</p>
            )}
          </div>
          {previewPayload && (
            <div className="space-y-4 border p-4 bg-muted/20 rounded-md">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold">Server-Derived Payload</h4>
                  <p className="text-xs text-muted-foreground">The platform integration payload below has been assembled securely by the server. Identity keys, UTM strings, lineage links, and connection metadata are injected automatically; they cannot be spoofed by the client.</p>
                </div>
              </div>

              <div className="space-y-3">
                {['campaign', 'activity', 'execution', 'connection'].map(key => {
                  const val = previewPayload[key];
                  if (!val || typeof val !== 'object') return null;
                  return (
                    <div key={key} className="space-y-1">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{key} Context</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(val).map(([k, v]) => (
                          <div key={k} className="bg-background border rounded px-2 py-1 flex justify-between">
                            <span className="text-[10px] uppercase text-muted-foreground">{k}</span>
                            <span className="text-xs font-medium font-mono ml-2 truncate max-w-[120px]">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1">
                <Label>Raw JSON</Label>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-[10px] whitespace-pre-wrap break-all">
                  {JSON.stringify(previewPayload, null, 2)}
                </pre>
              </div>
            </div>
          )}
          {attempts && attempts.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {attempts.length} audited attempt{attempts.length === 1 ? "" : "s"} · Last: {attempts[0]?.status}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={preview} disabled={!isApproved || !platformConnectionId || previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
            Dry run
          </Button>
          <Button onClick={publish} disabled={!isApproved || !platformConnectionId || publishMutation.isPending || !previewPayload}>
            {publishMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Publish to platform
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditExecutionDialog({ execution, activityId }: { execution: ActivityExecution, activityId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(execution.name);
  const [status, setStatus] = useState(execution.status ?? "draft");
  const updateMutation = useUpdateActivityExecution();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        executionKey: execution.executionKey,
        data: {
          name,
          status,
          creativeLineage: execution.creativeLineage ?? {},
          copyLineage: execution.copyLineage ?? {},
          assetIds: execution.assetIds ?? [],
          externalIds: execution.externalIds ?? {},
          configurationData: execution.configurationData ?? {},
          rowVersion: execution.rowVersion,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListActivityExecutionsQueryKey(activityId) });
      setOpen(false);
      toast({ title: "Execution updated" });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2">
          <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Execution</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`execution-name-${execution.executionKey}`}>Name</Label>
            <Input id={`execution-name-${execution.executionKey}`} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`execution-status-${execution.executionKey}`}>Status</Label>
            <Input id={`execution-status-${execution.executionKey}`} value={status} onChange={(event) => setStatus(event.target.value)} />
          </div>
          <p className="font-mono text-xs text-muted-foreground break-all">{execution.executionKey}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !name.trim()}>
            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
