import { useState, useMemo } from "react";
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
  AlertCircle,
  Target,
  Package,
  Users,
  Globe,
  Megaphone,
  Palette,
  Briefcase,
  LayoutGrid,
  Layers
} from "lucide-react";
import {
  Card,
  CardHeader,
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
      return { icon: Clock, bg: "bg-muted border-border text-foreground" };
  }
}

const CATEGORY_GROUPS = [
  {
    id: "strategy",
    icon: Target,
    label: "Strategy & Objectives",
    keys: ["campaign_type", "business_objective", "commercial_motion", "marketing_objective", "primary_conversion", "journey_stage", "strategic_program", "campaign_shortcode", "subcampaign", "utm_objective"]
  },
  {
    id: "product",
    icon: Package,
    label: "Products & Solutions",
    keys: ["product", "product_family", "product_line", "capability_solution", "customer_need"]
  },
  {
    id: "audience",
    icon: Users,
    label: "Audience & Segments",
    keys: ["segment", "subsegment", "account_size_tier", "account_priority_tier", "relationship", "buying_group_function", "persona", "seniority_level", "messaging_cohort", "behavioral_cohort", "audience_origin", "audience", "audience_segment"]
  },
  {
    id: "region",
    icon: Globe,
    label: "Regions & Markets",
    keys: ["region", "subregion", "country", "market_cluster", "language", "utm_region"]
  },
  {
    id: "channel",
    icon: Megaphone,
    label: "Channels & Platforms",
    keys: ["channel", "source", "delivery_mechanism", "platform", "activity_type", "capture_source", "display_partner", "app_source"]
  },
  {
    id: "creative",
    icon: Palette,
    label: "Creative & Content",
    keys: ["creative_format", "creative_type", "image_size", "gif_size", "video_length", "content_type", "creative_cta", "content_order", "email_type", "partner_email_type", "newsletter_version", "link_position", "nurture_sequence", "form_interest", "form_newsletter", "call_to_action", "ads_subtype"]
  },
  {
    id: "finance",
    icon: Briefcase,
    label: "Finance & Admin",
    keys: ["fiscal_calendar", "fiscal_year", "fiscal_quarter", "fiscal_period", "currency", "cost_center", "owner", "campaign_member_status_template"]
  }
];

function TaxonomyListContent() {
  const access = useTaxonomyAccess();
  const [activeCategory, setActiveCategory] = useState<TaxonomyCategoryKey | "all">("all");
  const [activeStatus, setActiveStatus] = useState<GovernanceStatus | "all">("all");
  const [search, setSearch] = useState("");

  const { data: categories = [], isLoading: isLoadingCategories } = useListTaxonomyCategories();

  // Fetch all values matching search and status so we can compute global category counts
  const { data: allValues, isLoading: isLoadingValues } = useListGovernedValues({
    status: activeStatus !== "all" ? activeStatus : undefined,
    search: search || undefined
  });

  const displayedValues = activeCategory === "all"
    ? allValues
    : allValues?.filter(v => v.category === activeCategory);

  const countsByCategory = useMemo(() => {
    if (!allValues) return {};
    return allValues.reduce((acc, val) => {
      acc[val.category] = (acc[val.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [allValues]);

  const groupedCategories = useMemo(() => {
    if (!categories) return [];

    const grouped = CATEGORY_GROUPS.map(g => ({
      ...g,
      items: categories.filter(c => g.keys.includes(c.key))
    })).filter(g => g.items.length > 0);

    const mappedKeys = new Set(CATEGORY_GROUPS.flatMap(g => g.keys));
    const otherItems = categories.filter(c => !mappedKeys.has(c.key));

    if (otherItems.length > 0) {
      grouped.push({
        id: "other",
        icon: LayoutGrid,
        label: "Other Criteria",
        keys: [],
        items: otherItems
      });
    }

    return grouped;
  }, [categories]);

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <TaxonomyHeader />

      <div className="px-4 md:px-6 lg:px-8 max-w-[1800px] mx-auto w-full mt-2">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* LEFT SIDEBAR: Taxonomy Hierarchy */}
          <Card className="w-full max-h-[460px] lg:w-[260px] xl:w-[280px] shrink-0 border-border/60 shadow-sm lg:sticky lg:top-24 flex flex-col lg:max-h-[calc(100vh-8rem)] bg-card overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border/60 bg-muted/10 backdrop-blur-sm flex items-center justify-between z-10 shrink-0">
              <h2 className="font-semibold text-sm tracking-tight">Taxonomy Criteria</h2>
              <Badge variant="secondary" className="px-1.5 font-mono text-[10px] bg-background/50 border-border/50">{categories.length}</Badge>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {isLoadingCategories ? (
                <div className="space-y-6">
                  <Skeleton className="h-9 w-full rounded-md bg-muted/60" />
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-28 bg-muted/60" />
                    <Skeleton className="h-7 w-full bg-muted/40" />
                    <Skeleton className="h-7 w-full bg-muted/40" />
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24 bg-muted/60" />
                    <Skeleton className="h-7 w-full bg-muted/40" />
                    <Skeleton className="h-7 w-full bg-muted/40" />
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setActiveCategory("all")}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-all duration-200 group text-left mb-2",
                      activeCategory === "all"
                        ? "bg-primary text-primary-foreground font-medium shadow-sm hover-elevate-2"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <span className="font-semibold flex items-center">
                      <Layers className={cn(
                        "h-4 w-4 mr-2 transition-colors",
                        activeCategory === "all" ? "text-primary-foreground/90" : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      All Categories
                    </span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-md font-mono transition-colors",
                      activeCategory === "all"
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-transparent text-muted-foreground/60 group-hover:text-muted-foreground"
                    )}>
                      {allValues?.length || 0}
                    </span>
                  </button>

                  <div className="space-y-5">
                    {groupedCategories.map(group => (
                      <div key={group.id}>
                        <div className="flex items-center gap-2 px-3 mb-1.5 text-muted-foreground/80">
                          <group.icon className="w-3.5 h-3.5" />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider">{group.label}</h3>
                        </div>
                        <div className="space-y-0.5">
                          {group.items.map(cat => {
                            const count = countsByCategory[cat.key] || 0;
                            const isActive = activeCategory === cat.key;

                            return (
                              <button
                                key={cat.key}
                                onClick={() => setActiveCategory(cat.key)}
                                className={cn(
                                  "w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-md transition-all duration-200 group text-left",
                                  isActive
                                    ? "bg-primary text-primary-foreground font-medium shadow-sm hover-elevate-2"
                                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                                  !isActive && count === 0 && "opacity-60 hover:opacity-100"
                                )}
                              >
                                <span className="truncate pr-2">{cat.displayName}</span>
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-md font-mono transition-colors",
                                  isActive
                                    ? "bg-primary-foreground/20 text-primary-foreground"
                                    : count > 0
                                      ? "bg-muted text-muted-foreground group-hover:bg-border/50 group-hover:text-foreground"
                                      : "bg-transparent text-muted-foreground/40 group-hover:text-muted-foreground"
                                )}>
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* RIGHT CONTENT: Data Table */}
          <Card className="flex-1 w-full min-w-0 border-border/60 shadow-sm overflow-hidden flex flex-col bg-card">
            <CardHeader className="bg-muted/10 border-b border-border/60 pb-3 pt-4 px-4 sm:px-6 flex-none">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:max-w-xs group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <Input
                      type="search"
                      placeholder="Search taxonomy values..."
                      className="pl-9 h-9 bg-background/50 hover:bg-background/80 focus:bg-background border-border/60 transition-all text-sm shadow-sm"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={activeStatus} onValueChange={(v) => setActiveStatus(v as any)}>
                    <SelectTrigger className="w-[160px] h-9 bg-background/50 hover:bg-background/80 focus:bg-background border-border/60 shadow-sm text-sm">
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
                  <Button asChild size="sm" className="w-full sm:w-auto gap-2 h-9 shadow-sm hover-elevate font-semibold tracking-wide">
                    <Link href="/taxonomy/new">
                      <Plus className="h-4 w-4" strokeWidth={2.5} />
                      Add Value
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>

            <div className="px-4 sm:px-6 py-2.5 bg-muted/5 border-b border-border/40 flex justify-between items-center text-xs text-muted-foreground flex-none">
              <span className="font-semibold text-foreground/80 tracking-tight">
                {activeCategory === "all"
                  ? "All Categories"
                  : categories?.find(c => c.key === activeCategory)?.displayName || activeCategory}
              </span>
              <span className="font-mono bg-muted/60 px-2 py-0.5 rounded border border-border/40">
                {displayedValues?.length || 0} {displayedValues?.length === 1 ? 'result' : 'results'}
              </span>
            </div>

            <div className="flex-1 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b-border/60">
                    <TableHead className="w-[140px] pl-6 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stable Key</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Value / Definition</TableHead>
                    <TableHead className="w-[180px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</TableHead>
                    <TableHead className="w-[80px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-center">Version</TableHead>
                    <TableHead className="w-[110px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-center">Status</TableHead>
                    <TableHead className="w-[80px] text-right pr-6 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                  {isLoadingValues ? (
                    Array.from({ length: 15 }).map((_, i) => (
                      <TableRow key={i} className="border-b-border/40">
                        <TableCell className="pl-6 py-3"><Skeleton className="h-4 w-24 bg-muted/60" /></TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1.5">
                            <Skeleton className="h-4 w-48 bg-muted/60" />
                            <Skeleton className="h-3 w-72 bg-muted/40" />
                          </div>
                        </TableCell>
                        <TableCell className="py-3"><Skeleton className="h-4 w-28 bg-muted/60" /></TableCell>
                        <TableCell className="py-3 text-center"><Skeleton className="h-4 w-8 mx-auto bg-muted/60" /></TableCell>
                        <TableCell className="py-3 text-center"><Skeleton className="h-5 w-20 mx-auto rounded-md bg-muted/60" /></TableCell>
                        <TableCell className="pr-6 py-3 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md bg-muted/60" /></TableCell>
                      </TableRow>
                    ))
                  ) : displayedValues && displayedValues.length > 0 ? (
                    displayedValues.map((val) => {
                      const statusConf = getStatusConfig(val.status);
                      const StatusIcon = statusConf.icon;
                      const cat = categories?.find(c => c.key === val.category);

                      return (
                        <TableRow key={val.id} className="group hover:bg-muted/30 transition-colors border-b-border/40">
                          <TableCell className="py-3 pl-6 align-top">
                            <span className="font-mono text-xs font-medium text-muted-foreground/80 mt-0.5 block">{val.stableKey}</span>
                          </TableCell>
                          <TableCell className="py-3 align-top">
                            <div className="flex flex-col gap-1 max-w-[350px] xl:max-w-[500px]">
                              <span className="font-semibold text-foreground text-[13px] leading-tight">{val.displayName}</span>
                              <span className="text-xs text-muted-foreground line-clamp-1 group-hover:line-clamp-none transition-all leading-snug" title={val.definition}>
                                {val.definition}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 align-top">
                            <span className="text-[12px] font-medium text-muted-foreground mt-0.5 block truncate pr-2">
                              {cat?.displayName || val.category}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 align-top text-center">
                            <div className="mt-0.5 flex justify-center">
                              <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-[4px] border border-border/40">
                                v{val.taxonomyVersion}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 align-top text-center">
                            <div className="mt-0.5 flex justify-center">
                              <Badge variant="outline" className={cn("capitalize px-2 py-0 h-[22px] text-[10px] font-bold tracking-wide shadow-none inline-flex items-center gap-1", statusConf.bg)}>
                                <StatusIcon className="h-3 w-3" strokeWidth={2.5} />
                                {val.status?.replace("_", " ")}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 pr-6 text-right align-top">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 transition-colors group-hover:bg-muted/50 data-[state=open]:bg-muted/50 mt-0.5">
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 border-border/60 shadow-md">
                                <DropdownMenuLabel className="text-xs font-medium">Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-border/60" />
                                <DropdownMenuItem asChild className="cursor-pointer text-xs font-medium">
                                  <Link href={`/taxonomy/${val.id}`}>
                                    <Eye className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                {access.canPropose && (
                                  <DropdownMenuItem asChild className="cursor-pointer text-xs font-medium">
                                    <Link href={`/taxonomy/${val.id}?edit=true`}>
                                      <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
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
                      <TableCell colSpan={6} className="h-72 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="h-14 w-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-1 border border-border/50 shadow-sm">
                            <Archive className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="text-[15px] font-semibold text-foreground tracking-tight">No governed values found</p>
                            <p className="text-[13px] text-muted-foreground max-w-sm mt-1.5 leading-snug">
                              {search || activeStatus !== "all"
                                ? "Adjust your filters or search query to find taxonomy values."
                                : "This category currently has no governed values."}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
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
