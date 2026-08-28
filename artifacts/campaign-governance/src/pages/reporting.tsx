import { FileBarChart2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Reporting() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Reporting &amp; Exports
        </h1>
        <p className="text-sm text-muted-foreground">
          Analyze campaign performance and governance compliance.
        </p>
      </div>

      <Card className="mt-4 border bg-card">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border shadow-sm">
            <FileBarChart2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">
            Insufficient data
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Reporting requires active campaigns and governed data flow. Export functionality is currently restricted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}