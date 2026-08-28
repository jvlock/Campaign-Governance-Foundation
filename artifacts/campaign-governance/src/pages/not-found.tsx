import { Layout } from "@/components/layout";
import { ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border shadow-sm mb-2">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">404</h1>
        <h2 className="text-xl font-semibold">Path Not Governed</h2>
        <p className="text-sm text-muted-foreground">
          The requested control panel path does not exist in the current architecture or you lack access.
        </p>
        <Link href="/">
          <Button className="mt-4 shadow-sm">
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}