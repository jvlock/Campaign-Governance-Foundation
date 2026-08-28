import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActivityExecutions,
  getListActivityExecutionsQueryKey,
  useCopyActivityExecution,
  useVersionActivityExecution,
  useUpdateActivityExecution,
  type ActivityExecution
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreateExecutionDialog } from "./CreateExecutionDialog";
import { Loader2, Copy, GitBranch, FileImage, Edit3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ActivityExecutions({ activityId }: { activityId: string }) {
  const { data: executions, isLoading } = useListActivityExecutions(activityId, {
    query: { queryKey: getListActivityExecutionsQueryKey(activityId) }
  });

  return (
    <div className="bg-card border rounded-md shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="p-3 border-b flex justify-between items-center bg-muted/10">
        <h5 className="font-semibold text-sm">Lineage & Executions</h5>
        <CreateExecutionDialog activityId={activityId} />
      </div>
      
      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !executions || executions.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground italic bg-background">No executions recorded yet. Create one to begin.</div>
      ) : (
        <table className="w-full text-sm text-left bg-background">
          <thead className="bg-muted/5 text-xs uppercase tracking-wider text-muted-foreground border-b font-bold">
            <tr>
              <th className="px-4 py-3">Variant Key</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Lineage</th>
              <th className="px-4 py-3">Assets</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {executions.map(ex => <ExecutionRow key={ex.executionKey} execution={ex} activityId={activityId} />)}
          </tbody>
        </table>
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
      <td className="px-4 py-3 text-xs">
        {execution.assetIds && execution.assetIds.length > 0 ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <FileImage className="w-3.5 h-3.5" /> {execution.assetIds.length} assets
          </span>
        ) : (
          <span className="text-muted-foreground opacity-50">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleCopy} disabled={copyMutation.isPending}>
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleVersion} disabled={versionMutation.isPending}>
            <GitBranch className="w-3.5 h-3.5 mr-1" /> Branch
          </Button>
          <EditExecutionDialog execution={execution} activityId={activityId} />
        </div>
      </td>
    </tr>
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
