import { useState } from "react";
import { useListTaxonomyValues } from "@workspace/api-client-react";
import type { TaxonomyType } from "@workspace/api-client-react";
import { 
  Tags,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Archive,
  ArrowRightLeft
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
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const TAXONOMY_TYPES: { id: TaxonomyType; label: string }[] = [
  { id: "segment", label: "Segments" },
  { id: "persona", label: "Personas" },
  { id: "product", label: "Products" },
  { id: "region", label: "Regions" },
  { id: "channel", label: "Channels" },
];

function getStatusConfig(status: string) {
  switch (status) {
    case "active":
      return { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" };
    case "draft":
      return { icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" };
    case "retired":
      return { icon: Archive, color: "text-muted-foreground", bg: "bg-muted border-muted-foreground/20 text-muted-foreground" };
    case "superseded":
      return { icon: ArrowRightLeft, color: "text-indigo-500", bg: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-400" };
    default:
      return { icon: Clock, color: "text-foreground", bg: "bg-muted text-foreground" };
  }
}

export default function Taxonomy() {
  const [activeTab, setActiveTab] = useState<TaxonomyType>("segment");
  const { data: values, isLoading } = useListTaxonomyValues({ type: activeTab });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Governed Taxonomy
        </h1>
        <p className="text-sm text-muted-foreground">
          Reference values for campaign segmentation and targeting.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Tabs */}
        <div className="flex bg-muted/50 p-1 rounded-md border w-full sm:w-auto overflow-x-auto">
          {TAXONOMY_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setActiveTab(type.id)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-sm transition-all whitespace-nowrap",
                activeTab === type.id 
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Pseudo-search (UI only for foundation phase) */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder="Filter values..." 
            className="h-9 w-full rounded-md border bg-background pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary disabled:opacity-50"
            disabled
          />
        </div>
      </div>

      <Card className="shadow-sm overflow-hidden border-border">
        <CardHeader className="bg-muted/10 border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tags className="h-5 w-5 text-primary" />
              <CardTitle className="capitalize">{activeTab} Values</CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3 w-3" />
              Governed Set
            </div>
          </div>
        </CardHeader>
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="w-[120px]">Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : values && values.length > 0 ? (
                values.map((val) => {
                  const statusConf = getStatusConfig(val.status);
                  const StatusIcon = statusConf.icon;
                  return (
                    <TableRow key={val.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                        {val.code}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{val.label}</span>
                          {val.notes && (
                            <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {val.notes}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {val.source}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        v{val.taxonomyVersion}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("capitalize px-2 py-0 h-6 font-medium shadow-none", statusConf.bg)}>
                          <StatusIcon className="mr-1.5 h-3 w-3" />
                          {val.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No values found for this taxonomy type.
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