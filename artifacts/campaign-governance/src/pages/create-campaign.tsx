import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  getListCampaignsQueryKey,
  getCampaign,
  getCampaignReadiness,
  getGetCampaignQueryKey,
  getGetCampaignReadinessQueryKey,
  useCreateCampaign,
  useGetCampaign,
  useGetCampaignReadiness,
  useListCampaigns,
  useListGovernedValues,
  useReplaceCampaignAudiences,
  useReplaceCampaignProducts,
  useSubmitCampaign,
  useUpdateCampaign,
} from "@workspace/api-client-react";
import type {
  AudienceDimension,
  AudienceSelectionInput,
  Campaign,
  CampaignInput,
  ProductAssociationInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, Check, HelpCircle, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

const STEPS = ["Identity", "Relationship", "Context", "Audiences", "Cohorts & sizing", "Products", "Dates & delivery", "Review & submit"];
const DIMENSIONS: Array<[AudienceDimension, string]> = [
  ["segment_family", "Segments"], ["subsegment", "Subsegments"], ["account_size_tier", "Account size tiers"],
  ["account_priority", "Account priority"], ["relationship", "Relationship"], ["buying_group_function", "Buying-group functions"],
  ["persona", "Personas"], ["seniority", "Seniority"], ["messaging_cohort", "Messaging cohorts"],
  ["behavioral_cohort", "Behavioral cohorts"], ["audience_origin", "Audience origin"], ["region", "Regions"],
  ["country", "Countries"], ["language", "Languages"], ["journey_stage", "Journey stages"],
];
const CATEGORY: Record<AudienceDimension, string> = {
  segment_family: "segment", subsegment: "subsegment", account_size_tier: "account_size_tier",
  account_priority: "account_priority_tier", relationship: "relationship", buying_group_function: "buying_group_function",
  persona: "persona", seniority: "seniority_level", messaging_cohort: "messaging_cohort",
  behavioral_cohort: "behavioral_cohort", audience_origin: "audience_origin", region: "region",
  country: "country", language: "language", journey_stage: "journey_stage",
};

const blank: CampaignInput = {
  name: "", campaignType: "integrated", relationshipType: "new", objective: "", customerNeed: "",
  desiredAction: "", deliverySummary: "", isEvergreen: false, setupData: { wizardStep: 0, channelValueIds: [] },
};

export default function CreateCampaign() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const requestedKey = new URLSearchParams(window.location.search).get("draft");
  const { data: requested } = useGetCampaign(requestedKey ?? "", { query: { enabled: Boolean(requestedKey), queryKey: getGetCampaignQueryKey(requestedKey ?? "") } });
  const { data: registry = [] } = useListCampaigns();
  // Keep the complete campaign catalog independent of every category-specific
  // taxonomy query. This prevents a filtered response from ever occupying the
  // all-active catalog cache entry used by audience, cohort, channel and product steps.
  const { data: governed = [] } = useListGovernedValues(
    { status: "active" },
    { query: { queryKey: ["campaign-wizard", "all-active-governed-values"] } },
  );
  const { data: activeSegments = [] } = useListGovernedValues(
    { category: "segment", status: "active" },
    { query: { queryKey: ["campaign-wizard", "active-segments"] } },
  );
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignInput>(blank);
  const [step, setStep] = useState(0);
  const [audiences, setAudiences] = useState<AudienceSelectionInput[]>([]);
  const [products, setProducts] = useState<ProductAssociationInput[]>([]);
  const [error, setError] = useState("");
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const pipelineRef = useRef(false);
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const replaceAudiences = useReplaceCampaignAudiences();
  const replaceProducts = useReplaceCampaignProducts();
  const submit = useSubmitCampaign();
  const { data: readiness } = useGetCampaignReadiness(draft?.campaignKey ?? "", { query: { enabled: Boolean(draft) && step === 7, queryKey: getGetCampaignReadinessQueryKey(draft?.campaignKey ?? "") } });

  useEffect(() => {
    if (!requested) return;
    setDraft(requested);
    setForm(requested);
    setAudiences(requested.audiences.map(({ id: _id, campaignKey: _key, warningCodes: _warnings, createdAt: _created, accountSizeRuleVersion: _rule, accountSizeRuleId: _ruleId, reviewRequestId: _request, resolutionStatus: _status, ...item }) => item));
    setProducts(requested.products.map(({ id: _id, campaignKey: _key, createdAt: _created, ...item }) => item));
    setStep(Number(requested.setupData.wizardStep ?? 0));
  }, [requested]);

  const valuesFor = (dimension: AudienceDimension) =>
    dimension === "segment_family"
      ? activeSegments.filter((value) => value.category === "segment" && value.status === "active")
      : governed.filter((value) => value.category === CATEGORY[dimension] && value.status === "active");
  const selected = (dimension: AudienceDimension, valueId: string) =>
    audiences.some((item) => item.dimension === dimension && item.governedValueId === valueId);
  const toggleAudience = (dimension: AudienceDimension, valueId: string, displayName: string) => {
    if (selected(dimension, valueId)) {
      setAudiences((current) => {
        const removed = current.find((item) => item.dimension === dimension && item.governedValueId === valueId);
        const remaining = current.filter((item) => !(item.dimension === dimension && item.governedValueId === valueId));
        if (dimension === "segment_family" && removed?.isPrimary) {
          const nextPrimary = remaining.find((item) => item.dimension === "segment_family");
          return nextPrimary ? remaining.map((item) => ({ ...item, isPrimary: item === nextPrimary })) : remaining;
        }
        return remaining;
      });
      return;
    }
    setAudiences((current) => [...current, {
      dimension, governedValueId: valueId,
      isPrimary: dimension === "segment_family" && !current.some((item) => item.dimension === "segment_family" && item.isPrimary),
      measurementBasis: dimension === "account_size_tier" ? "Assets under management" : null,
      rawRepresentativeTitle: dimension === "persona" ? displayName : null,
    }]);
  };
  const normalizedForm = (wizardStep: number): CampaignInput => ({
    ...form,
    parentCampaignKey: form.relationshipType === "wave" || form.relationshipType === "activity" ? form.parentCampaignKey : null,
    copiedFromCampaignKey: form.relationshipType === "copy" ? form.copiedFromCampaignKey : null,
    setupData: { ...form.setupData, wizardStep },
  });
  async function save(nextStep = step): Promise<Campaign | null> {
    setError("");
    try {
      const data = normalizedForm(nextStep);
      const saved = draft
        ? await update.mutateAsync({ campaignKey: draft.campaignKey, data: { ...data, rowVersion: draft.rowVersion, reason: `Guided setup step ${nextStep + 1}` } })
        : await create.mutateAsync({ data });
      let latest = saved;
      setDraft(latest);
      setForm(data); setStep(nextStep);
      if (step === 1 && data.relationshipType !== "new") {
        const inheritedDetail = await getCampaign(saved.campaignKey);
        setAudiences(inheritedDetail.audiences.map(({ id: _id, campaignKey: _key, warningCodes: _warnings, createdAt: _created, accountSizeRuleVersion: _rule, accountSizeRuleId: _ruleId, reviewRequestId: _request, resolutionStatus: _status, ...item }) => item));
        setProducts(inheritedDetail.products.map(({ id: _id, campaignKey: _key, createdAt: _created, ...item }) => item));
      }
      if (step === 3 || step === 4) {
        const audienceResult = await replaceAudiences.mutateAsync({
          campaignKey: latest.campaignKey,
          data: { rowVersion: latest.rowVersion, selections: audiences },
        });
        latest = { ...latest, rowVersion: audienceResult.rowVersion };
        setDraft(latest);
      }
      if (step === 5) {
        const productResult = await replaceProducts.mutateAsync({
          campaignKey: latest.campaignKey,
          data: { rowVersion: latest.rowVersion, associations: products },
        });
        latest = { ...latest, rowVersion: productResult.rowVersion };
        setDraft(latest);
      }
      setDraft(latest);
      await client.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      await client.invalidateQueries({ queryKey: getGetCampaignReadinessQueryKey(latest.campaignKey) });
      return latest;
    } catch (cause) { setError((cause as Error).message || "The draft could not be saved."); return null; }
  }
  async function runPipeline(task: () => Promise<void>) {
    if (pipelineRef.current) return;
    pipelineRef.current = true;
    setPipelineBusy(true);
    try { await task(); } finally { pipelineRef.current = false; setPipelineBusy(false); }
  }
  async function nextInternal() {
    if (step === 0 && !form.name.trim()) { setError("Enter a campaign name."); return; }
    if (step === 2 && (!form.objective || !form.customerNeed || !form.desiredAction)) { setError("Complete the objective, customer need, and desired action."); return; }
    if (step === 3 && audiences.filter((item) => item.dimension === "segment_family" && item.isPrimary).length !== 1) { setError("Choose one primary segment."); return; }
    await save(Math.min(7, step + 1));
  }
  async function finishInternal() {
    if (!draft) return;
    const saved = await save(7);
    if (!saved) return;
    const result = await getCampaignReadiness(saved.campaignKey);
    if (!result.ready) { setError(result.issues.join(" ") || "Campaign is not ready."); return; }
    try {
      await submit.mutateAsync({ campaignKey: saved.campaignKey, data: { reason: "Guided setup completed and reviewed", rowVersion: saved.rowVersion } });
      navigate(`/campaigns/${saved.campaignKey}`);
    } catch (cause) { setError((cause as Error).message || "Submission failed."); }
  }
  const inherited = form.relationshipType !== "new";
  const sourceLocked = Boolean(draft?.parentCampaignKey || draft?.copiedFromCampaignKey);
  const selectedProductIds = useMemo(() => new Set(products.map((product) => product.productValueId)), [products]);

  return <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-16">
    <header><Badge variant="outline">Server-persisted guided setup</Badge><h1 className="mt-2 text-3xl font-bold">Plan a governed campaign</h1><p className="text-sm text-muted-foreground">Every Next action saves the draft. Resume owned drafts from the registry.</p></header>
    <div><div className="mb-2 flex justify-between text-xs"><span>Step {step + 1} of {STEPS.length}: {STEPS[step]}</span><span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span></div><Progress value={((step + 1) / STEPS.length) * 100} /></div>
    {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Check this step</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]"><Card><CardHeader><CardTitle>{STEPS[step]}</CardTitle></CardHeader><CardContent className="space-y-5">
      {step === 0 && <><Label>Name<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Label><Label>Campaign type<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.campaignType} onChange={(event) => setForm({ ...form, campaignType: event.target.value as CampaignInput["campaignType"] })}>{["integrated","activation","nurture","event","research_content","paid_media","sales_cadence","client_expansion","newsletter","in_app","approved_other"].map((type) => <option key={type}>{type}</option>)}</select></Label></>}
      {step === 1 && <><p>Is this new, related work, or a governed copy?</p><div className="grid gap-2 sm:grid-cols-4">{(["new","wave","activity","copy"] as const).map((relationshipType) => <Button key={relationshipType} disabled={sourceLocked} variant={form.relationshipType === relationshipType ? "default" : "outline"} onClick={() => setForm({ ...form, relationshipType })}>{relationshipType}</Button>)}</div>{inherited && <Label>Source campaign<select disabled={sourceLocked} className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.relationshipType === "copy" ? form.copiedFromCampaignKey ?? "" : form.parentCampaignKey ?? ""} onChange={(event) => setForm({ ...form, [form.relationshipType === "copy" ? "copiedFromCampaignKey" : "parentCampaignKey"]: event.target.value || null })}><option value="">Choose…</option>{registry.filter((campaign) => campaign.campaignKey !== draft?.campaignKey).map((campaign) => <option key={campaign.campaignKey} value={campaign.campaignKey}>{campaign.name}</option>)}</select></Label>}<p className="text-xs text-muted-foreground">Inherited audience and product rows retain their source through the campaign copy transaction and history snapshot. Once inherited, the source is immutable.</p></>}
      {step === 2 && <><Label>Business objective<Textarea value={form.objective ?? ""} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></Label><Label>Customer need<Textarea value={form.customerNeed ?? ""} onChange={(event) => setForm({ ...form, customerNeed: event.target.value })} /></Label><Label>Desired action<Textarea value={form.desiredAction ?? ""} onChange={(event) => setForm({ ...form, desiredAction: event.target.value })} /></Label></>}
      {(step === 3 || step === 4) && <div className="space-y-5">{DIMENSIONS.filter(([dimension]) => step === 4 ? ["account_size_tier","messaging_cohort","behavioral_cohort"].includes(dimension) : !["account_size_tier","messaging_cohort","behavioral_cohort"].includes(dimension)).map(([dimension, label]) => <section key={dimension}><h3 className="mb-2 font-medium">{label}</h3><div className="flex flex-wrap gap-2">{valuesFor(dimension).map((value) => <div key={value.id} className="flex items-center gap-1"><Button size="sm" variant={selected(dimension, value.id) ? "default" : "outline"} onClick={() => toggleAudience(dimension, value.id, value.displayName)}>{selected(dimension, value.id) && <Check className="mr-1 h-3 w-3" />}{value.displayName}</Button>{dimension === "segment_family" && selected(dimension, value.id) && <Button size="sm" variant={audiences.some((item) => item.governedValueId === value.id && item.isPrimary) ? "secondary" : "outline"} onClick={() => setAudiences((current) => current.map((item) => item.dimension === "segment_family" ? { ...item, isPrimary: item.governedValueId === value.id } : item))}>Primary</Button>}</div>)}</div>{dimension === "segment_family" && !valuesFor(dimension).length && <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4" /><AlertTitle>No active segments available</AlertTitle><AlertDescription>Run the idempotent taxonomy seed or ask a governance administrator to activate canonical segment values.</AlertDescription></Alert>}{dimension === "persona" && <div className="mt-2 flex flex-wrap gap-2"><span className="text-xs text-muted-foreground">Unresolved source classification (creates a linked review request, never a permanent persona):</span>{["Other","All","Mixed-title"].map((label) => <Button key={label} size="sm" variant={audiences.some((item) => item.dimension === "persona" && item.unresolvedLabel === label) ? "secondary" : "outline"} onClick={() => setAudiences((current) => current.some((item) => item.dimension === "persona" && item.unresolvedLabel === label) ? current.filter((item) => item.unresolvedLabel !== label) : [...current, { dimension: "persona", unresolvedLabel: label, isPrimary: false, provenance: "unresolved" }])}>{label}</Button>)}</div>}</section>)}{step === 4 && <><section><h3 className="mb-2 font-medium">Governed delivery channels</h3><div className="flex flex-wrap gap-2">{governed.filter((value) => value.category === "channel" && value.stableKey.startsWith("CHANNEL_")).map((value) => { const channelIds = (form.setupData?.channelValueIds as string[] | undefined) ?? []; const active = channelIds.includes(value.id); return <Button key={value.id} size="sm" variant={active ? "default" : "outline"} onClick={() => setForm({ ...form, setupData: { ...form.setupData, channelValueIds: active ? channelIds.filter((id) => id !== value.id) : [...channelIds, value.id] } })}>{value.displayName}</Button>; })}</div></section><Alert><HelpCircle className="h-4 w-4" /><AlertTitle>Exact governed versions</AlertTitle><AlertDescription>Account tiers are checked against the selected primary segment’s current basis, thresholds, unit, and rule version. Cohorts persist the exact current effective treatment compatible with selected governed channels. Deliberate execution consolidation belongs to activities and never creates a persona.</AlertDescription></Alert></>}</div>}
      {step === 5 && <div className="space-y-3">{governed.filter((value) => ["product","capability_solution"].includes(value.category)).map((value) => <div key={value.id} className="flex items-center gap-3 rounded-md border p-3"><Checkbox checked={selectedProductIds.has(value.id)} onCheckedChange={(checked) => setProducts((current) => { if (checked) return [...current, { productValueId: value.id, role: "primary_solution", isPrimary: current.length === 0, provenance: "selected" }]; const remaining = current.filter((item) => item.productValueId !== value.id); return current.find((item) => item.productValueId === value.id)?.isPrimary && remaining.length ? remaining.map((item, index) => ({ ...item, isPrimary: index === 0 })) : remaining; })} /><span className="flex-1">{value.displayName}</span>{selectedProductIds.has(value.id) && <><Button size="sm" variant={products.find((item) => item.productValueId === value.id)?.isPrimary ? "default" : "outline"} onClick={() => setProducts((current) => current.map((item) => ({ ...item, isPrimary: item.productValueId === value.id })))}>Primary</Button><select value={products.find((item) => item.productValueId === value.id)?.role} onChange={(event) => setProducts((current) => current.map((item) => item.productValueId === value.id ? { ...item, role: event.target.value as ProductAssociationInput["role"] } : item))}>{["primary_solution","supporting_capability","cross_sell_offer","upsell_offer","proof_point","content_data_source","cta_destination","internal_relevance"].map((role) => <option key={role}>{role}</option>)}</select></>}</div>)}</div>}
      {step === 6 && <><div className="grid gap-4 sm:grid-cols-2"><Label>Start date<Input type="date" value={form.startDate ?? ""} onChange={(event) => setForm({ ...form, startDate: event.target.value || null })} /></Label><Label>End date<Input type="date" disabled={form.isEvergreen} value={form.endDate ?? ""} onChange={(event) => setForm({ ...form, endDate: event.target.value || null })} /></Label></div><Label className="flex items-center gap-2"><Checkbox checked={form.isEvergreen} onCheckedChange={(checked) => setForm({ ...form, isEvergreen: Boolean(checked), endDate: checked ? null : form.endDate })} />Evergreen campaign</Label><Label>Review date<Input type="date" value={form.reviewDate ?? ""} onChange={(event) => setForm({ ...form, reviewDate: event.target.value || null })} /></Label><Label>Delivery context<Textarea value={form.deliverySummary ?? ""} onChange={(event) => setForm({ ...form, deliverySummary: event.target.value })} /></Label></>}
      {step === 7 && <div className="space-y-4"><p className="text-sm">Review the persisted plan, probable duplicates, unresolved governance requests, and readiness before submission.</p><div className="grid gap-3 sm:grid-cols-3"><Badge variant="outline">{audiences.length} audience selections</Badge><Badge variant="outline">{products.length} products</Badge><Badge variant={readiness?.ready ? "default" : "secondary"}>{readiness?.ready ? "Ready" : "Needs attention"}</Badge></div>{readiness?.probableDuplicates?.map((duplicate) => <Alert key={duplicate.campaignKey}><AlertCircle className="h-4 w-4" /><AlertTitle>Probable duplicate</AlertTitle><AlertDescription>{duplicate.name} has the same normalized name, period, and type.</AlertDescription></Alert>)}{readiness?.issues.map((issue) => <p key={issue} className="text-sm text-destructive">{issue}</p>)}</div>}
    </CardContent></Card><aside className="space-y-4"><Card><CardContent className="p-4 text-sm"><HelpCircle className="mb-2 h-5 w-5 text-primary" /><p className="font-medium">Why this step?</p><p className="mt-1 text-muted-foreground">Selections remain separate governed dimensions. Suggestions are never silently selected.</p></CardContent></Card>{draft && <Card><CardContent className="p-4 text-xs"><p className="font-medium">Saved draft</p><p className="mt-1 break-all font-mono">{draft.campaignKey}</p></CardContent></Card>}</aside></div>
    <footer className="flex justify-between"><Button variant="outline" disabled={step === 0 || pipelineBusy} onClick={() => setStep((current) => current - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><div className="flex gap-2"><Button variant="outline" onClick={() => runPipeline(async () => { await save(step); })} disabled={pipelineBusy}><Save className="mr-2 h-4 w-4" />Save</Button>{step < 7 ? <Button disabled={pipelineBusy} onClick={() => runPipeline(nextInternal)}>Next<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button onClick={() => runPipeline(finishInternal)} disabled={!draft || pipelineBusy}>Submit for review</Button>}</div></footer>
  </div>;
}