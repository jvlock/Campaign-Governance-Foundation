import { Lock, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function CreateCampaign() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          New Campaign
        </h1>
        <p className="text-sm text-muted-foreground">
          Initialize a new marketing or sales campaign.
        </p>
      </div>

      <Card className="mt-8 border-dashed bg-muted/30">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
          <div className="relative mb-6">
            <div className="absolute -inset-1 rounded-full bg-primary/10 blur-xl"></div>
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-card border shadow-sm">
              <Lock className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-background shadow-sm">
              <Construction className="h-4 w-4" />
            </div>
          </div>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">
            Campaign Architecture Phase
          </h2>
          <p className="mb-8 max-w-md text-sm text-muted-foreground">
            Campaign creation is currently locked. The system is in the foundation phase, 
            where segment definitions and taxonomy values are being strictly governed and approved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/taxonomy">
              <Button variant="outline" className="shadow-sm">
                Review Taxonomy
              </Button>
            </Link>
            <Link href="/">
              <Button className="shadow-sm">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}