import { FolderSearch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function Campaigns() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Campaign Directory
          </h1>
          <p className="text-sm text-muted-foreground">
            Governed workspace for active and archived campaigns.
          </p>
        </div>
        <Link href="/create-campaign">
          <Button className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      <Card className="mt-4 border bg-card">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
            <FolderSearch className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">
            No active campaigns
          </h2>
          <p className="mb-8 max-w-sm text-sm text-muted-foreground">
            The directory is awaiting foundation completion. Once the taxonomy is finalized, your governed campaigns will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}