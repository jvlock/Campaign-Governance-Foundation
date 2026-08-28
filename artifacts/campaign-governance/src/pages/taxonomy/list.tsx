import { useState } from "react";
import { Link } from "wouter";
import { 
  useListGovernedValues, 
  useListTaxonomyCategories 
} from "@workspace/api-client-react";
import type { TaxonomyCategoryKey, GovernanceStatus } from "@workspace/api-client-react";
import { 
  Search,
  CheckCircle2,
  Clock,
  Archive,
  ArrowRightLeft,
  Plus,
  MoreHorizontal,
  Pencil,
  Eye,
  AlertCircle
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TaxonomyGuard, useTaxonomyAccess } from "@/components/taxonomy/taxonomy-guard";
import { TaxonomyHeader } from "@/components/taxonomy/taxonomy-header";

function getStatusConfig(status: GovernanceStatus) {
  switch (status) {
    case "active":
      return { icon: CheckCircle2, bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" };
    case "approved":
      return { icon: CheckCircle2, bg: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400" };
    case "draft":
      return { icon: Clock, bg: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" };
    case "in_review":
      return { icon: AlertCircle, bg: "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-400" };
    case "inactive":
      return { icon: Archive, bg: "bg-muted border-muted-foreground/20 text-muted-foreground" };
    case "superseded":
      return { icon: ArrowRightLeft, bg: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-400" };
    default:
      return { icon: Clock, bg: "bg-muted text-foreground" };
  }
}

function TaxonomyListContent() {
  const access = useTaxonomyAccess();
  const [activeCategory, setActiveCategory] = useState<TaxonomyCategoryKey | "all">("all");
  const [activeStatus, setActiveStatus] = useState<GovernanceStatus | "all">("all");
  const [search, setSearch] = useState("");

  const { data: categories, isLoading: isLoadingCategories } = useListTaxonomyCategories();
  
  const { data: values, isLoading: isLoadingValues } = useListGovernedValues({
    category: activeCategory !== "all" ? activeCategory : undefined,
    status: activeStatus !== "all" ? activeStatus : undefined,
    search: search || undefined
  });

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <TaxonomyHeader />

      <Card className="shadow-sm overflow-hidden border-border">
        <CardHeader className="bg-muted/30 border-b pb-4 pt-6 px-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="search"
                  placeholder="Search values..." 
                  className="pl-9 h-10 bg-background"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={activeCategory} onValueChange={(v) => setActiveCategory(v as any)}>
                <SelectTrigger className="w-[180px] h-10 bg-background">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeStatus} onValueChange={(v) => setActiveStatus(v as any)}>
                <SelectTrigger className="w-[140px] h-10 bg-background">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="superseded">Superseded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {access.canPropose && (
              <Button asChild className="w-full sm:w-auto gap-2">
                <Link href="/taxonomy/new">
                  <Plus className="h-4 w-4" />
                  New Value
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <div className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="w-[180px] pl-6">Stable Key</TableHead>
                <TableHead>Value / Definition</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead className="w-[80px] text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingValues ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6"><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell className="pr-6 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : values && values.length > 0 ? (
                values.map((val) => {
                  const statusConf = getStatusConfig(val.status);
                  const StatusIcon = statusConf.icon;
                  const cat = categories?.find(c => c.key === val.category);
                  
                  return (
                    <TableRow key={val.id} className="group">
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground pl-6">
                        {val.stableKey}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col max-w-[400px]">
                          <span className="font-medium text-foreground">{val.displayName}</span>
                          <span className="text-xs text-muted-foreground truncate" title={val.definition}>
                            {val.definition}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {cat?.displayName || val.category}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        v{val.taxonomyVersion}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("capitalize px-2 py-0.5 h-6 font-medium shadow-none", statusConf.bg)}>
                          <StatusIcon className="mr-1.5 h-3 w-3" />
                          {val.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link href={`/taxonomy/${val.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {access.canPropose && (
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/taxonomy/${val.id}?edit=true`}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Value
                                </Link>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Archive className="h-8 w-8 text-muted-foreground/50" />
                      <p>No governed values found matching your criteria.</p>
                    </div>
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

export default function TaxonomyList() {
  return (
    <TaxonomyGuard>
      <TaxonomyListContent />
    </TaxonomyGuard>
  );
}
