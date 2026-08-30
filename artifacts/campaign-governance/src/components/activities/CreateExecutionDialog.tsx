import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateActivityExecution,
  getListActivityExecutionsQueryKey,
  type CampaignActivityDetail
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CreateExecutionDialog({ activity }: { activity: CampaignActivityDetail }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateActivityExecution();

  const form = useForm({
    defaultValues: {
      name: "",
      status: "draft",
      assetIds: "",
      configurationData: "{}"
    }
  });

  // Seed data when opened
  useEffect(() => {
    if (open) {
      form.reset({
        name: `${activity.name} Variant`,
        status: "draft",
        assetIds: activity.assetIds ? activity.assetIds.join(", ") : "",
        configurationData: activity.configurationAnswers
          ? JSON.stringify(activity.configurationAnswers, null, 2)
          : "{}"
      });
    }
  }, [open, activity, form]);

  const onSubmit = async (values: any) => {
    try {
      const parseJson = (val: string, field: string) => {
        try {
          return JSON.parse(val || "{}");
        } catch {
          throw new Error(`${field} must be valid JSON`);
        }
      };

      await createMutation.mutateAsync({
        activityId: activity.id,
        data: {
          name: values.name,
          status: values.status,
          assetIds: values.assetIds ? values.assetIds.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          configurationData: parseJson(values.configurationData, "Platform configuration"),
          // Do not copy lineage or external IDs on initial creation to preserve safety
          externalIds: {},
          creativeLineage: {},
          copyLineage: {}
        }
      });
      queryClient.invalidateQueries({ queryKey: getListActivityExecutionsQueryKey(activity.id) });
      toast({ title: "Execution created successfully" });
      setOpen(false);
      form.reset();
    } catch (e: any) {
      toast({ title: "Creation failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 shadow-sm gap-1"><Plus className="w-3.5 h-3.5" /> Add Execution</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-border/40 shadow-xl">
        <DialogHeader className="p-6 border-b bg-card">
          <DialogTitle>New Execution Variant</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id="create-execution-form" onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-background max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({field}) => (
                <FormItem><FormLabel>Execution Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="status" render={({field}) => (
                <FormItem>
                  <FormLabel>Initial Status</FormLabel>
                  <FormControl><Input {...field} readOnly className="bg-muted/30 text-muted-foreground" /></FormControl>
                </FormItem>
              )} />
            </div>
            
            <FormField control={form.control} name="assetIds" render={({field}) => (
              <FormItem>
                <FormLabel>Associated Asset IDs (comma separated)</FormLabel>
                <FormControl><Input {...field} className="font-mono text-xs" /></FormControl>
                <FormDescription>Seeded from parent activity.</FormDescription>
              </FormItem>
            )} />

            <FormField control={form.control} name="configurationData" render={({field}) => (
              <FormItem>
                <FormLabel>Platform Config (JSON)</FormLabel>
                <FormControl><Textarea {...field} className="font-mono text-xs h-32 bg-muted/10" /></FormControl>
                <FormDescription>Seeded from activity configuration context.</FormDescription>
              </FormItem>
            )} />
          </form>
        </Form>
        <DialogFooter className="p-6 border-t bg-muted/5">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="create-execution-form" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Execution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
