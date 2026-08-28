import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListTaxonomyReviewRequests,
  useCreateTaxonomyReviewRequest,
  useListTaxonomyCategories,
  getListTaxonomyReviewRequestsQueryKey
} from "@workspace/api-client-react";
import type { TaxonomyCategoryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Plus,
  Loader2
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
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
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { TaxonomyGuard, useTaxonomyAccess } from "@/components/taxonomy/taxonomy-guard";
import { TaxonomyHeader } from "@/components/taxonomy/taxonomy-header";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const requestSchema = z.object({
  category: z.string().min(1, "Category is required"),
  proposedName: z.string().min(2, "Proposed name must be at least 2 characters").max(100),
  context: z.string().min(10, "Please provide enough context for the taxonomy administrators"),
});

type RequestFormValues = z.infer<typeof requestSchema>;

function ReviewRequestsContent() {
  const access = useTaxonomyAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: requests, isLoading } = useListTaxonomyReviewRequests();
  const { data: categories } = useListTaxonomyCategories();
  const permittedCategories = access.categories.length
    ? categories?.filter((category) => access.categories.includes(category.key))
    : categories;
  const createMut = useCreateTaxonomyReviewRequest();

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      category: "",
      proposedName: "",
      context: "",
    }
  });

  const onSubmit = (data: RequestFormValues) => {
    createMut.mutate({
      data: {
        category: data.category as TaxonomyCategoryKey,
        proposedName: data.proposedName,
        context: data.context
      }
    }, {
      onSuccess: () => {
        toast({ title: "Request Submitted", description: "Your taxonomy review request has been recorded." });
        queryClient.invalidateQueries({ queryKey: getListTaxonomyReviewRequestsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Submission Failed", description: err?.response?.data?.error || "Could not submit request", variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <TaxonomyHeader />

      <Card className="shadow-sm overflow-hidden border-border">
        <CardHeader className="bg-muted/10 border-b pb-4 pt-6 px-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <GitPullRequest className="h-5 w-5 text-primary" />
              Pending Value Requests
            </CardTitle>
            {access.canPropose && (
              <Button onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto gap-2">
                <Plus className="h-4 w-4" />
                New Request
              </Button>
            )}
          </div>
        </CardHeader>
        <div className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/5 hover:bg-muted/5">
                <TableHead className="w-[180px] pl-6">Requested Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Context / Justification</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[120px] text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6"><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="h-8 w-16 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : requests && requests.length > 0 ? (
                requests.map((req) => (
                  <TableRow key={req.id} className="group">
                    <TableCell className="font-medium pl-6">
                      {req.proposedName}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="secondary" className="font-mono text-xs font-normal">
                        {req.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate" title={req.context}>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        <span className="truncate">{req.context}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.requestedBy}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(req.createdAt), "MMM d")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "capitalize px-2 py-0.5 h-6 font-medium shadow-none",
                        req.status === 'open' ? "bg-amber-500/10 text-amber-700 border-amber-500/20" :
                        req.status === 'resolved' ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" :
                        "bg-destructive/10 text-destructive border-destructive/20"
                      )}>
                        {req.status === 'open' && <Clock className="mr-1.5 h-3 w-3" />}
                        {req.status === 'resolved' && <CheckCircle2 className="mr-1.5 h-3 w-3" />}
                        {req.status === 'rejected' && <XCircle className="mr-1.5 h-3 w-3" />}
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {req.status === 'open' && access.canAdminister ? (
                        <Button size="sm" variant="outline" disabled>Queue Read-Only</Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                      <p>No pending review requests.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Taxonomy Request</DialogTitle>
            <DialogDescription>
              Propose a new value to be added to the governed taxonomy. Our data stewards will review your request.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select the taxonomy category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {permittedCategories?.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="proposedName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Proposed Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Enterprise Software" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="context" render={({ field }) => (
                <FormItem>
                  <FormLabel>Context & Justification</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Why is this value needed? How will it be used in campaigns?" 
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Provide sufficient detail for the steward to make a decision.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Request
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TaxonomyReviewRequests() {
  return (
    <TaxonomyGuard>
      <ReviewRequestsContent />
    </TaxonomyGuard>
  );
}
