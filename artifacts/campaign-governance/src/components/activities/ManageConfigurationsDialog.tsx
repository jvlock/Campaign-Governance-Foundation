import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActivityTypeConfigurations,
  getListActivityTypeConfigurationsQueryKey,
  useCreateActivityTypeConfiguration,
  usePublishActivityTypeConfiguration,
  useListGovernedValues,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Plus, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";

export function ManageConfigurationsDialog() {
  const [open, setOpen] = useState(false);
  const { data: configs, isLoading: isConfigsLoading } = useListActivityTypeConfigurations({}, {
    query: { queryKey: getListActivityTypeConfigurationsQueryKey() }
  });
  
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shadow-sm hover:bg-muted/50"><Settings2 className="w-4 h-4 mr-2" /> Manage Configurations</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full h-[90vh] p-0 flex flex-col overflow-hidden border-border/40 shadow-2xl">
        <DialogHeader className="p-5 border-b bg-card shrink-0 shadow-sm z-10">
          <DialogTitle className="text-xl">Activity Type Configurations</DialogTitle>
        </DialogHeader>
        <div className="flex-1 flex overflow-hidden bg-background">
           <div className="w-1/3 border-r flex flex-col h-full bg-muted/5 shadow-inner">
             <div className="p-4 border-b bg-card">
               <Button 
                 onClick={() => { setIsCreating(true); setSelectedConfigId(null); }} 
                 className="w-full shadow-sm"
                 variant={isCreating ? "default" : "outline"}
               >
                 <Plus className="w-4 h-4 mr-2" /> New Configuration
               </Button>
             </div>
             <ScrollArea className="flex-1">
               {isConfigsLoading ? (
                 <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
               ) : (
                 <div className="flex flex-col">
                   {configs?.map(c => (
                     <button 
                       key={c.id} 
                       onClick={() => { setIsCreating(false); setSelectedConfigId(c.id); }}
                       className={cn(
                         "text-left p-4 border-b transition-colors hover:bg-muted/20 focus:outline-none", 
                         selectedConfigId === c.id && !isCreating ? "bg-muted/30 border-l-4 border-l-primary" : "border-l-4 border-l-transparent"
                       )}
                     >
                       <div className="font-semibold text-foreground mb-1">{c.displayName}</div>
                       <div className="flex justify-between items-center mt-2">
                         <div className="text-[11px] text-muted-foreground font-mono bg-muted/30 px-1.5 py-0.5 rounded">{c.stableKey}</div>
                         <Badge variant={c.status === 'published' ? 'default' : 'secondary'} className="text-[10px] uppercase tracking-wider">{c.status}</Badge>
                       </div>
                     </button>
                   ))}
                   {configs?.length === 0 && (
                     <div className="p-8 text-center text-sm text-muted-foreground">No configurations found.</div>
                   )}
                 </div>
               )}
             </ScrollArea>
           </div>
           <div className="w-2/3 h-full overflow-hidden bg-card">
             {isCreating ? (
               <CreateConfigForm onCancel={() => setIsCreating(false)} onSuccess={() => setIsCreating(false)} />
             ) : selectedConfigId ? (
               <ConfigDetail configId={selectedConfigId} />
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                 <Settings2 className="w-12 h-12 mb-4 opacity-20" />
                 <p className="font-medium">Select a configuration to view details</p>
                 <p className="text-sm opacity-70">Or create a new one to define channel behavior.</p>
               </div>
             )}
           </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateConfigForm({ onCancel, onSuccess }: { onCancel: () => void, onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateActivityTypeConfiguration();
  const { data: channels } = useListGovernedValues({ category: "channel" });

  const form = useForm({
    defaultValues: {
      stableKey: "",
      displayName: "",
      channelValueId: "",
      version: "1",
      namingTemplate: "{campaign}_{channel}_{activity}",
      memberStatuses: "Sent, Responded, Converted",
      inheritableFields: "deliveryStartDate, deliveryEndDate, productValueIds",
      permittedOverrides: "productValueIds",
      validations: "{}",
      questions: [] as any[]
    }
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "questions" });

  const selectedChannelId = form.watch("channelValueId");
  const selectedChannel = channels?.find(c => c.id === selectedChannelId);
  const isMCP = selectedChannel?.displayName?.toLowerCase().includes("mcp") || selectedChannel?.stableKey?.toLowerCase().includes("mcp");

  const onSubmit = async (values: any) => {
    try {
      let parsedValidations = {};
      try {
        parsedValidations = JSON.parse(values.validations || "{}");
      } catch (e) {
        toast({ title: "Invalid JSON in validations", variant: "destructive" });
        return;
      }

      await createMutation.mutateAsync({
        data: {
          stableKey: values.stableKey,
          displayName: values.displayName,
          channelValueId: values.channelValueId || null,
          version: Number(values.version),
          namingTemplate: values.namingTemplate,
          memberStatuses: values.memberStatuses ? values.memberStatuses.split(",").map((s: string) => s.trim()) : [],
          inheritableFields: values.inheritableFields ? values.inheritableFields.split(",").map((s: string) => s.trim()) : [],
          permittedOverrides: values.permittedOverrides ? values.permittedOverrides.split(",").map((s: string) => s.trim()) : [],
          validations: parsedValidations,
          questions: values.questions.map((q: any) => ({
            key: q.key,
            label: q.label,
            required: q.required,
            options: q.options ? q.options.split(",").map((s: string) => s.trim()) : undefined,
            requiredWhen: q.requiredWhenField ? { field: q.requiredWhenField, equals: q.requiredWhenEquals } : undefined
          }))
        }
      });
      queryClient.invalidateQueries({ queryKey: getListActivityTypeConfigurationsQueryKey() });
      toast({ title: "Configuration created as Draft" });
      onSuccess();
    } catch (e: any) {
      toast({ title: "Creation failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b flex justify-between items-center bg-muted/5 shrink-0">
        <div>
          <h3 className="text-lg font-bold">New Configuration</h3>
          <p className="text-sm text-muted-foreground">Draft a new activity channel configuration</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Draft
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-6">
        <Form {...form}>
          <form className="space-y-8 pb-12">
            
            {isMCP && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-md flex gap-3 text-sm shadow-sm animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800">Controlled Intent Category (MCP)</p>
                  <p className="mt-1 opacity-90">Model Context Protocol channels require rigorous governance. Raw intent prompts cannot be stored in URLs or standard analytics tracking. Please ensure your configuration questions and validation rules enforce secure prompt handling.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <FormField control={form.control} name="displayName" render={({field}) => (
                <FormItem><FormLabel>Display Name</FormLabel><FormControl><Input {...field} placeholder="e.g. MCP Activation" /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="stableKey" render={({field}) => (
                <FormItem><FormLabel>Stable Key</FormLabel><FormControl><Input {...field} className="font-mono text-sm" placeholder="e.g. mcp_activation" /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="channelValueId" render={({field}) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select channel..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {channels?.map(c => <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="version" render={({field}) => (
                <FormItem><FormLabel>Version</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
              )} />
            </div>

            <div className="space-y-4">
              <h4 className="font-bold border-b pb-2">Fields & Overrides</h4>
              <div className="grid grid-cols-2 gap-6">
                <FormField control={form.control} name="inheritableFields" render={({field}) => (
                  <FormItem><FormLabel>Inheritable Fields (comma separated)</FormLabel><FormControl><Input {...field} className="font-mono text-xs" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="permittedOverrides" render={({field}) => (
                  <FormItem><FormLabel>Permitted Overrides (comma separated)</FormLabel><FormControl><Input {...field} className="font-mono text-xs" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="namingTemplate" render={({field}) => (
                  <FormItem><FormLabel>Naming Template</FormLabel><FormControl><Input {...field} className="font-mono text-xs" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="memberStatuses" render={({field}) => (
                  <FormItem><FormLabel>Member Statuses (comma separated)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-bold">Dynamic Questions</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ key: "", label: "", required: false, options: "", requiredWhenField: "", requiredWhenEquals: "" })}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Question
                </Button>
              </div>
              {fields.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-muted/10 p-4 rounded text-center italic">No dynamic questions configured.</div>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="p-4 border rounded-md bg-muted/5 space-y-4 relative group">
                      <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => remove(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name={`questions.${index}.key`} render={({field}) => (
                          <FormItem><FormLabel>Question Key</FormLabel><FormControl><Input {...field} className="font-mono text-xs" placeholder="e.g. target_prompt" /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`questions.${index}.label`} render={({field}) => (
                          <FormItem><FormLabel>Label</FormLabel><FormControl><Input {...field} placeholder="e.g. Target Prompt" /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`questions.${index}.options`} render={({field}) => (
                          <FormItem><FormLabel>Options (comma separated, optional)</FormLabel><FormControl><Input {...field} placeholder="e.g. High, Medium, Low" /></FormControl></FormItem>
                        )} />
                        <div className="flex items-center pt-8">
                          <FormField control={form.control} name={`questions.${index}.required`} render={({field}) => (
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                              <FormLabel>Required</FormLabel>
                            </FormItem>
                          )} />
                        </div>
                        <FormField control={form.control} name={`questions.${index}.requiredWhenField`} render={({field}) => (
                          <FormItem><FormLabel>Visible When (Field Key)</FormLabel><FormControl><Input {...field} className="font-mono text-xs" placeholder="e.g. requires_prompt" /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`questions.${index}.requiredWhenEquals`} render={({field}) => (
                          <FormItem><FormLabel>Visible When (Equals Value)</FormLabel><FormControl><Input {...field} placeholder="e.g. Yes" /></FormControl></FormItem>
                        )} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="font-bold border-b pb-2">Validation Rules (JSON)</h4>
              <FormField control={form.control} name="validations" render={({field}) => (
                <FormItem>
                  <FormControl>
                    <Textarea {...field} className="font-mono text-xs h-32 bg-muted/10" placeholder="{}" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}

function ConfigDetail({ configId }: { configId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: configs } = useListActivityTypeConfigurations({}, {
    query: { queryKey: getListActivityTypeConfigurationsQueryKey() }
  });
  const config = configs?.find(c => c.id === configId);
  const publishMutation = usePublishActivityTypeConfiguration();

  if (!config) return null;

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync({ configurationId: configId, data: { reason: "Publishing for general use" } });
      queryClient.invalidateQueries({ queryKey: getListActivityTypeConfigurationsQueryKey() });
      toast({ title: "Configuration Published" });
    } catch (e: any) {
      toast({ title: "Publish failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="p-6 border-b bg-muted/5 flex justify-between items-start shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{config.displayName}</h2>
            <Badge variant={config.status === 'published' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider">{config.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            {config.stableKey} <span className="opacity-50 mx-2">|</span> v{config.version}
          </p>
        </div>
        {config.status === 'draft' && (
          <Button onClick={handlePublish} disabled={publishMutation.isPending} className="shadow-sm">
            {publishMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Publish Configuration
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">
          
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Channel ID</span>
              <p className="font-medium text-sm">{config.channelValueId || 'None'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Naming Template</span>
              <p className="font-mono text-sm bg-muted/20 p-2 rounded border">{config.namingTemplate}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Inheritable Fields</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {config.inheritableFields.map(f => <Badge key={f} variant="outline" className="font-mono">{f}</Badge>)}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Permitted Overrides</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {config.permittedOverrides.map(f => <Badge key={f} variant="outline" className="font-mono border-primary/30 text-primary">{f}</Badge>)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Dynamic Questions</h4>
            {config.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No dynamic questions defined.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {config.questions.map((q, idx) => (
                  <div key={idx} className="p-4 border rounded-md bg-muted/5 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold">{q.label || q.key}</span>
                        {q.required && <Badge variant="destructive" className="ml-2 text-[10px] h-4 px-1.5">Required</Badge>}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{q.key}</span>
                    </div>
                    {q.options && q.options.length > 0 && (
                      <div className="text-xs text-muted-foreground flex gap-2">
                        Options: {q.options.map(o => <Badge key={o} variant="secondary" className="text-[10px]">{o}</Badge>)}
                      </div>
                    )}
                    {q.requiredWhen && (
                      <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded mt-1 border">
                        Visible when <span className="font-mono font-bold text-foreground">{q.requiredWhen.field}</span> equals <span className="font-mono font-bold text-foreground">{String(q.requiredWhen.equals)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Validation Rules</h4>
            <pre className="p-4 bg-muted/10 border rounded-md font-mono text-xs overflow-x-auto text-muted-foreground">
              {JSON.stringify(config.validations, null, 2)}
            </pre>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
