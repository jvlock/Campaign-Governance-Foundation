import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Approvals() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          QA &amp; Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Review and approve campaign assets and targeting criteria.
        </p>
      </div>

      <Card className="mt-4 border bg-card">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border shadow-sm">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">
            Queue empty
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            All foundation tasks have been cleared. Approval workflows will activate when campaign drafts are submitted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}