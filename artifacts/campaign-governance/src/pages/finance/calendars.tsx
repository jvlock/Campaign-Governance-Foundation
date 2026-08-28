import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Plus, ShieldCheck, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  useListFiscalCalendars, 
  useCreateFiscalCalendar, 
  usePublishFiscalCalendarSnapshot,
  getListFiscalCalendarsQueryKey,
  useGetActiveFiscalCalendarSnapshot,
  FiscalPeriodInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Calendars() {
  const { data: calendars, isLoading } = useListFiscalCalendars();
  const primaryCalendar = calendars?.[0];
  const hasSnapshot = !!primaryCalendar?.activeSnapshotId;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: activeSnapshot, isLoading: isLoadingSnapshot } = useGetActiveFiscalCalendarSnapshot(
    primaryCalendar?.id ?? "",
    { query: { enabled: !!primaryCalendar?.id, queryKey: ['activeSnapshot', primaryCalendar?.id] } }
  );

  // Create Calendar State
  const [createOpen, setCreateOpen] = useState(false);
  const [stableKey, setStableKey] = useState("");
  const [name, setName] = useState("");
  const createCalendar = useCreateFiscalCalendar();

  // Publish Snapshot State
  const [publishOpen, setPublishOpen] = useState(false);
  const [version, setVersion] = useState(1);
  const [periods, setPeriods] = useState<FiscalPeriodInput[]>([]);
  const publishSnapshot = usePublishFiscalCalendarSnapshot();

  const handleOpenPublish = (open: boolean) => {
    setPublishOpen(open);
    if (open) {
      const year = new Date().getFullYear().toString();
      setVersion(activeSnapshot ? activeSnapshot.version + 1 : 1);
      setPeriods([
        { stableKey: `${primaryCalendar?.stableKey || "CAL"}-${year}-Q1`, fiscalYear: year, fiscalQuarter: "Q1", fiscalPeriod: "Q1", startDate: `${year}-01-01`, endDate: `${year}-03-31` },
        { stableKey: `${primaryCalendar?.stableKey || "CAL"}-${year}-Q2`, fiscalYear: year, fiscalQuarter: "Q2", fiscalPeriod: "Q2", startDate: `${year}-04-01`, endDate: `${year}-06-30` },
        { stableKey: `${primaryCalendar?.stableKey || "CAL"}-${year}-Q3`, fiscalYear: year, fiscalQuarter: "Q3", fiscalPeriod: "Q3", startDate: `${year}-07-01`, endDate: `${year}-09-30` },
        { stableKey: `${primaryCalendar?.stableKey || "CAL"}-${year}-Q4`, fiscalYear: year, fiscalQuarter: "Q4", fiscalPeriod: "Q4", startDate: `${year}-10-01`, endDate: `${year}-12-31` },
      ]);
    }
  };

  const handleUpdatePeriod = (index: number, field: keyof FiscalPeriodInput, value: string) => {
    const newPeriods = [...periods];
    newPeriods[index] = { ...newPeriods[index], [field]: value };
    setPeriods(newPeriods);
  };

  const handleAddPeriod = () => {
    setPeriods([
      ...periods,
      { stableKey: "", fiscalYear: "", fiscalQuarter: "", fiscalPeriod: "", startDate: "", endDate: "" }
    ]);
  };

  const handleRemovePeriod = (index: number) => {
    setPeriods(periods.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    try {
      await createCalendar.mutateAsync({
        data: { stableKey, name }
      });
      toast({ title: "Calendar created successfully" });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: getListFiscalCalendarsQueryKey() });
    } catch (e: any) {
      toast({ title: "Error creating calendar", description: e.message, variant: "destructive" });
    }
  };

  const handlePublish = async () => {
    if (!primaryCalendar) return;
    try {
      await publishSnapshot.mutateAsync({
        calendarId: primaryCalendar.id,
        data: {
          version,
          rules: {},
          periods
        }
      });
      toast({ title: "Snapshot published" });
      setPublishOpen(false);
      queryClient.invalidateQueries({ queryKey: getListFiscalCalendarsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ['activeSnapshot', primaryCalendar.id] });
    } catch (e: any) {
      toast({ title: "Error publishing", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Fiscal Calendars
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl">
            Administer immutable financial periods for campaign budgeting. 
            Active snapshots govern how budgets roll up across quarters and years.
          </p>
        </div>
        <div className="flex gap-2">
          {!primaryCalendar && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-sm shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  New Calendar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Fiscal Calendar</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Stable Key</Label>
                    <Input value={stableKey} onChange={e => setStableKey(e.target.value)} placeholder="CORP-FISCAL" />
                  </div>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Global Fiscal Calendar" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={createCalendar.isPending || !stableKey || !name}>
                    {createCalendar.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {primaryCalendar && (
            <Dialog open={publishOpen} onOpenChange={handleOpenPublish}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Publish Snapshot
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Publish Fiscal Snapshot</DialogTitle>
                  <DialogDescription>Define explicit planning periods. These boundaries protect immutable budget allocations.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-2 max-w-[200px]">
                    <Label>Snapshot Version</Label>
                    <Input type="number" value={version} onChange={e => setVersion(Number(e.target.value))} min={1} />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Configured Periods</Label>
                      <Button variant="outline" size="sm" onClick={handleAddPeriod} className="h-8 gap-1"><Plus className="w-3.5 h-3.5" /> Add Row</Button>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground px-2">
                        <div className="col-span-2">Stable Key</div>
                        <div className="col-span-1">Year</div>
                        <div className="col-span-1">Quarter</div>
                        <div className="col-span-2">Period</div>
                        <div className="col-span-3">Start Date (YYYY-MM-DD)</div>
                        <div className="col-span-3">End Date (YYYY-MM-DD)</div>
                      </div>
                      
                      {periods.map((period, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center bg-muted/10 p-2 rounded-md border">
                          <div className="col-span-2">
                            <Input className="h-8 text-xs font-mono" value={period.stableKey} onChange={(e) => handleUpdatePeriod(i, "stableKey", e.target.value)} placeholder="Key" />
                          </div>
                          <div className="col-span-1">
                            <Input className="h-8 text-xs" value={period.fiscalYear} onChange={(e) => handleUpdatePeriod(i, "fiscalYear", e.target.value)} placeholder="YYYY" />
                          </div>
                          <div className="col-span-1">
                            <Input className="h-8 text-xs" value={period.fiscalQuarter} onChange={(e) => handleUpdatePeriod(i, "fiscalQuarter", e.target.value)} placeholder="Q" />
                          </div>
                          <div className="col-span-2">
                            <Input className="h-8 text-xs" value={period.fiscalPeriod} onChange={(e) => handleUpdatePeriod(i, "fiscalPeriod", e.target.value)} placeholder="Label" />
                          </div>
                          <div className="col-span-3">
                            <Input className="h-8 text-xs font-mono" type="date" value={period.startDate} onChange={(e) => handleUpdatePeriod(i, "startDate", e.target.value)} />
                          </div>
                          <div className="col-span-2 border-r pr-2">
                            <Input className="h-8 text-xs font-mono" type="date" value={period.endDate} onChange={(e) => handleUpdatePeriod(i, "endDate", e.target.value)} />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleRemovePeriod(i)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handlePublish} disabled={publishSnapshot.isPending || periods.length === 0}>
                    {publishSnapshot.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Publish {periods.length} Periods
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border bg-card shadow-sm h-fit">
          <CardHeader className="bg-primary/5 border-b border-border/50">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="text-primary border-primary/30 bg-background uppercase tracking-widest text-[10px] font-bold">
                Primary Master
              </Badge>
            </div>
            <CardTitle className="text-xl">
              {primaryCalendar?.name || "No Calendar Configured"}
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              ID: {primaryCalendar?.stableKey || "N/A"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Active Snapshot ID</span>
                <span className="font-medium font-mono text-xs">{primaryCalendar?.activeSnapshotId || 'None'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Active Version</span>
                <span className="font-medium font-mono text-xs">{activeSnapshot ? `v${activeSnapshot.version}.0` : 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Status</span>
                {hasSnapshot ? (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none">
                    Published & Locked
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">
                    No Snapshot
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border bg-card shadow-sm">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Governed Periods
            </CardTitle>
            <CardDescription>
              All planning periods within the active fiscal snapshot. Budgets must align exactly to these boundaries.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading || isLoadingSnapshot ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm">Loading governed calendar...</p>
              </div>
            ) : !hasSnapshot || !activeSnapshot ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground text-sm">The active snapshot details are not available or not yet published.</p>
              </div>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 gap-4 p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  <div className="col-span-2">Period</div>
                  <div className="col-span-2">Quarter</div>
                  <div className="col-span-2">Year</div>
                  <div className="col-span-4">Boundary Dates</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                {activeSnapshot.periods.map((period) => (
                  <div key={period.id} className="grid grid-cols-12 gap-4 p-4 text-sm items-center hover:bg-muted/5 transition-colors">
                    <div className="col-span-2 font-mono font-medium">{period.fiscalPeriod}</div>
                    <div className="col-span-2">{period.fiscalQuarter}</div>
                    <div className="col-span-2">{period.fiscalYear}</div>
                    <div className="col-span-4 text-muted-foreground">
                      {format(new Date(period.startDate), "MMM d, yyyy")} - {format(new Date(period.endDate), "MMM d, yyyy")}
                    </div>
                    <div className="col-span-2 text-right">
                      {period.status === "open" ? (
                        <Badge variant="outline" className="border-primary/30 text-primary">Open</Badge>
                      ) : (
                        <Badge variant="secondary" className="opacity-70">Closed</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
