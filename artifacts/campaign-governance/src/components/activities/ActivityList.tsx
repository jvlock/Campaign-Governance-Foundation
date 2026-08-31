import { useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { 
  type CampaignDetail, 
  type CampaignActivityDetail,
  useUpdateCampaignActivity,
  getGetCampaignQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Activity, Lock, Edit3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ActivityExecutions } from "./ActivityExecutions";

export function ActivityList({ campaign }: { campaign: CampaignDetail }) {
  if (!campaign.activities || campaign.activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-t border-dashed">
        <div className="bg-muted/10 p-4 rounded-full mb-4">
          <Activity className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg text-foreground">No Activities Planned</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-2">
          Create governed channel activities to apply naming standards and track execution lineage.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/30 text-[11px] uppercase tracking-wider font-bold text-muted-foreground border-b">
          <tr>
            <th className="px-4 py-3 w-10 text-center"></th>
            <th className="px-4 py-3">Activity ID</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Channel / Type</th>
            <th className="px-4 py-3">Delivery Dates</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {campaign.activities.map(act => <ActivityRow key={act.id} activity={act} campaign={campaign} />)}
        </tbody>
      </table>
    </div>
  );
}

function ActivityRow({ activity, campaign }: { activity: CampaignActivityDetail, campaign: CampaignDetail }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [updateOpen, setUpdateOpen] = useState(false);
  const [name, setName] = useState(activity.name);
  const updateActivity = useUpdateCampaignActivity();

  const handleUpdate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateActivity.mutateAsync({
        activityId: activity.id,
        data: {
          name,
          deliveryStartDate: activity.deliveryStartDate,
          deliveryEndDate: activity.deliveryEndDate,
          authoritativeCostMinor: activity.authoritativeCostMinor,
          currency: activity.currency,
          productValueIds: activity.productValueIds || [],
          reason: "Manual update",
          rowVersion: activity.rowVersion || 1
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.campaignKey) });
      setUpdateOpen(false);
      toast({ title: "Activity updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <tr className="hover:bg-muted/5 transition-colors group cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="px-4 py-4 w-10 text-center">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground group-hover:text-foreground" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
             {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </td>
        <td
          className="px-4 py-4 font-mono text-xs font-bold text-primary tracking-tight"
          title={activity.id}
        >
          {activity.id.split('-')[0].toUpperCase()}
        </td>
        <td className="px-4 py-4 font-semibold text-foreground">{activity.name}</td>
        <td className="px-4 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-xs">{activity.activityType || 'Custom'}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {activity.configuration?.stableKey || 'Unmanaged'}
            </span>
          </div>
        </td>
        <td className="px-4 py-4 text-xs text-muted-foreground">
          {format(new Date(activity.deliveryStartDate), "MMM d")} - {format(new Date(activity.deliveryEndDate), "MMM d, yy")}
        </td>
        <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                </div>
                <DialogFooter>
                  <Button onClick={handleUpdate} disabled={updateActivity.isPending}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </td>
      </tr>
      
      {expanded && (
        <tr>
          <td colSpan={6} className="p-0 border-b">
            <div className="bg-muted/5 p-6 border-l-4 border-l-primary/60 shadow-inner">
               <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8">
                 
                 {/* Detail Card */}
                 <div className="bg-background border rounded-md p-4 shadow-sm flex-1">
                   <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4 border-b pb-2">Configuration Facts</h4>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 col-span-2">
                        <span className="text-[10px] uppercase text-muted-foreground font-bold">Activity Key</span>
                        <p className="font-mono text-xs break-all bg-muted/20 px-2 py-1 rounded">{activity.id}</p>
                      </div>
                     <div className="space-y-1">
                       <span className="text-[10px] uppercase text-muted-foreground font-bold">Config Version</span>
                       <p className="font-mono text-sm bg-muted/20 px-2 py-1 rounded w-fit">v{activity.configurationVersion || 'N/A'}</p>
                     </div>
                     <div className="space-y-1">
                       <span className="text-[10px] uppercase text-muted-foreground font-bold">Inherited Context</span>
                       <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                         <Lock className="w-3.5 h-3.5 text-emerald-600" />
                         <span>Campaign Dates & Products Bound</span>
                       </div>
                     </div>
                   </div>
                 </div>

                 {/* Answers Card */}
                 <div className="bg-background border rounded-md p-4 shadow-sm flex-1">
                   <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4 border-b pb-2">Dynamic Configuration</h4>
                   {(!activity.configurationAnswers || Object.keys(activity.configurationAnswers).length === 0) ? (
                     <span className="text-sm text-muted-foreground italic">No custom answers provided.</span>
                   ) : (
                     <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                       {Object.entries(activity.configurationAnswers as Record<string, string>).map(([k, v]) => (
                         <div key={k} className="flex flex-col">
                           <span className="text-[10px] font-mono text-muted-foreground uppercase">{k.replace(/_/g, ' ')}</span>
                           <span className="text-sm font-semibold">{String(v) || '-'}</span>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>

               </div>
               
               <ActivityExecutions activity={activity} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
