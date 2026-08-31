import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useCreateCampaign,
  getListCampaignsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  name: z.string().min(5, "Campaign name must be at least 5 characters").max(100),
  campaignType: z.enum([
    "integrated", "activation", "nurture", "event", 
    "research_content", "paid_media", "sales_cadence", 
    "client_expansion", "newsletter", "in_app", "approved_other"
  ]),
  relationshipType: z.enum(["new", "wave", "activity", "copy"]),
  objective: z.string().min(10, "Please provide a clear objective").optional().or(z.literal("")),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  isEvergreen: z.boolean().default(false),
  reviewDate: z.date().optional(),
}).refine(data => {
  if (!data.isEvergreen && data.startDate && data.endDate) {
    return data.endDate > data.startDate;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
});

export default function CreateCampaign() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [createdCampaignKey, setCreatedCampaignKey] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      campaignType: "integrated",
      relationshipType: "new",
      objective: "",
      isEvergreen: false,
    }
  });

  const isEvergreen = form.watch("isEvergreen");

  const createCampaign = useCreateCampaign();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    let campaignKey = createdCampaignKey;
    try {
      if (!campaignKey) {
        const result = await createCampaign.mutateAsync({
          data: {
            name: values.name,
            campaignType: values.campaignType,
            relationshipType: values.relationshipType,
            objective: values.objective || undefined,
            isEvergreen: values.isEvergreen,
            startDate: values.startDate ? format(values.startDate, "yyyy-MM-dd") : undefined,
            endDate: (!values.isEvergreen && values.endDate) ? format(values.endDate, "yyyy-MM-dd") : undefined,
            reviewDate: values.reviewDate ? format(values.reviewDate, "yyyy-MM-dd") : undefined,
          }
        });
        campaignKey = result.campaignKey;
        setCreatedCampaignKey(campaignKey);
      }
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      
      toast({
        title: "Campaign Initialized",
        description: `Successfully created ${campaignKey}`,
      });
      
      setCreatedCampaignKey(null);
      setLocation(`/campaigns/${campaignKey}`);
    } catch (err: any) {
      // If we failed after creation, invalidate list so it shows up
      if (campaignKey) {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      }
      toast({
        variant: "destructive",
        title: "Initialization Failed",
        description: err.message || "An unexpected error occurred",
      });
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase tracking-widest text-[10px] font-bold">New Foundation</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Initialize Campaign
        </h1>
        <p className="text-muted-foreground text-sm">
          Establish the enduring identity, naming context, and active dates for a new campaign.
          Audiences, products, activities, and tracking details are configured next.
        </p>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary font-bold">Governance Note</AlertTitle>
        <AlertDescription className="text-primary/80">
          Campaign identity is immutable once created. This establishes the master UTM key used across all downstream systems.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* Identity & Context */}
          <Card className="border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-lg">Identity & Context</CardTitle>
              <CardDescription>Core identity that defines this initiative</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 pt-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold">Campaign Name</FormLabel>
                    <FormControl>
                      <Input disabled={!!createdCampaignKey} placeholder="e.g. Q4 Enterprise Cloud Migration" className="bg-background max-w-xl" {...field} />
                    </FormControl>
                    <FormDescription>Use the governed naming convention and a clear, durable description.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="campaignType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Type Classification</FormLabel>
                      <Select disabled={!!createdCampaignKey} onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="integrated">Integrated Global Campaign</SelectItem>
                          <SelectItem value="activation">Regional Activation</SelectItem>
                          <SelectItem value="nurture">Always-On Nurture</SelectItem>
                          <SelectItem value="event">Major Event / Conference</SelectItem>
                          <SelectItem value="paid_media">Paid Media Burst</SelectItem>
                          <SelectItem value="client_expansion">Client Expansion</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="relationshipType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Hierarchy Relationship</FormLabel>
                      <Select disabled={!!createdCampaignKey} onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select relationship" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="new">Net New Independent</SelectItem>
                          <SelectItem value="wave">Wave of Existing</SelectItem>
                          <SelectItem value="activity">Sub-Activity</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold">Primary Objective</FormLabel>
                    <FormControl>
                      <Textarea 
                        disabled={!!createdCampaignKey}
                        placeholder="What is the measurable business outcome this campaign will drive?" 
                        className="resize-none bg-background min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Temporal Governance */}
          <Card className="border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-lg">Temporal Governance</CardTitle>
              <CardDescription>When is this initiative active in market?</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 pt-6">
              <FormField
                control={form.control}
                name="isEvergreen"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-background">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Evergreen Campaign</FormLabel>
                      <FormDescription>
                        This campaign runs continuously without a planned end date (e.g. baseline nurture).
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        disabled={!!createdCampaignKey}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-primary"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-foreground font-semibold">Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={!!createdCampaignKey}
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal bg-background",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className={cn("text-foreground font-semibold", isEvergreen && "text-muted-foreground")}>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={isEvergreen || !!createdCampaignKey}
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal bg-background",
                                !field.value && "text-muted-foreground",
                                isEvergreen && "opacity-50"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const start = form.getValues("startDate");
                              return start ? date < start : false;
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reviewDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-foreground font-semibold">Review Date (Optional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={!!createdCampaignKey}
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal bg-background",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4 pt-4 pb-20">
            <Link href="/campaigns">
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createCampaign.isPending} className="shadow-sm shadow-primary/20 gap-2 font-bold px-8">
              {createCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Create Governed Campaign
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
