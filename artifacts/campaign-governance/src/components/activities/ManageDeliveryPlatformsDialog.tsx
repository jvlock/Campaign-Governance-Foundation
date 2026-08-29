import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListDeliveryPlatformConnectionsQueryKey,
  useCreateDeliveryPlatformConnection,
  useListDeliveryPlatformConnections,
  useListGovernedValues,
  useUpdateDeliveryPlatformConnection,
} from "@workspace/api-client-react";
import { Cable, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function ManageDeliveryPlatformsDialog() {
  const [open, setOpen] = useState(false);
  const [channelValueId, setChannelValueId] = useState("");
  const [platformKey, setPlatformKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [externalIdPath, setExternalIdPath] = useState("id");
  const [isActive, setIsActive] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: channels } = useListGovernedValues({ category: "channel" });
  const { data: connections, isLoading } = useListDeliveryPlatformConnections();
  const createMutation = useCreateDeliveryPlatformConnection();
  const updateMutation = useUpdateDeliveryPlatformConnection();

  const refresh = () => queryClient.invalidateQueries({
    queryKey: getListDeliveryPlatformConnectionsQueryKey(),
  });

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        data: { channelValueId, platformKey, displayName, endpointUrl, externalIdPath, isActive },
      });
      await refresh();
      setPlatformKey("");
      setDisplayName("");
      setEndpointUrl("");
      setExternalIdPath("id");
      setIsActive(false);
      toast({ title: "Delivery platform configured" });
    } catch (error: any) {
      toast({ title: "Connection failed", description: error.message, variant: "destructive" });
    }
  };

  const toggleConnection = async (connectionId: string, nextActive: boolean) => {
    try {
      await updateMutation.mutateAsync({ connectionId, data: { isActive: nextActive } });
      await refresh();
      toast({ title: nextActive ? "Connection activated" : "Connection paused" });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shadow-sm hover:bg-muted/50">
          <Cable className="w-4 h-4 mr-2" /> Delivery Platforms
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Governed delivery platform connections</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold">Configured platforms</h3>
              <p className="text-sm text-muted-foreground">Only active connections are available when publishing.</p>
            </div>
            {isLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : connections?.length ? (
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {connections.map((connection) => (
                  <div key={connection.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{connection.displayName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{connection.platformKey}</div>
                      <div className="text-xs text-muted-foreground truncate mt-1">{connection.endpointUrl}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor={`active-${connection.id}`} className="text-xs">
                        {connection.isActive ? "Active" : "Paused"}
                      </Label>
                      <Checkbox
                        id={`active-${connection.id}`}
                        checked={connection.isActive}
                        disabled={updateMutation.isPending}
                        onCheckedChange={(checked) => toggleConnection(connection.id, checked === true)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
                No live delivery platforms are configured.
              </div>
            )}
          </div>
          <div className="border rounded-md p-4 space-y-4 bg-muted/10">
            <div>
              <h3 className="font-semibold flex items-center"><Plus className="w-4 h-4 mr-2" /> Add platform</h3>
              <p className="text-xs text-muted-foreground mt-1">Use a real HTTPS endpoint with no query parameters. New connections are paused by default.</p>
            </div>
            <div className="space-y-2">
              <Label>Governed channel</Label>
              <Select value={channelValueId} onValueChange={setChannelValueId}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {channels?.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="platform-key">Platform key</Label>
                <Input id="platform-key" value={platformKey} onChange={(event) => setPlatformKey(event.target.value)} placeholder="email_cloud" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform-name">Display name</Label>
                <Input id="platform-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Email Cloud" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint-url">Publish endpoint</Label>
              <Input id="endpoint-url" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://delivery.example.com/executions" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="external-id-path">External ID response path</Label>
              <Input id="external-id-path" value={externalIdPath} onChange={(event) => setExternalIdPath(event.target.value)} placeholder="data.id" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="activate-now" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              <Label htmlFor="activate-now">Activate immediately</Label>
            </div>
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={createMutation.isPending || !channelValueId || !platformKey || !displayName || !endpointUrl}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save connection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}