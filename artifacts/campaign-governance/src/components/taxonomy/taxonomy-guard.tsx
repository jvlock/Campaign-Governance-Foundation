import { createContext, useContext, ReactNode } from "react";
import { getGetTaxonomyAccessQueryKey, useGetTaxonomyAccess } from "@workspace/api-client-react";
import type { TaxonomyAccess } from "@workspace/api-client-react";
import { ShieldAlert, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TaxonomyAccessContextValue {
  access: TaxonomyAccess;
}

const TaxonomyAccessContext = createContext<TaxonomyAccessContextValue | null>(null);

export function useTaxonomyAccess() {
  const context = useContext(TaxonomyAccessContext);
  if (!context) {
    throw new Error("useTaxonomyAccess must be used within a TaxonomyGuard");
  }
  return context.access;
}

export function TaxonomyGuard({ children }: { children: ReactNode }) {
  const { data: access, isLoading, isError, error } = useGetTaxonomyAccess({
    query: {
      queryKey: getGetTaxonomyAccessQueryKey(),
      retry: false,
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] w-full flex-col items-center justify-center gap-4 text-muted-foreground animate-in fade-in duration-500">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Verifying access...</p>
      </div>
    );
  }

  const isUnauthorized = isError && (error as any)?.status === 401;
  const isForbidden = isError && (error as any)?.status === 403;

  if (isUnauthorized || !access) {
    return (
      <div className="flex h-[60vh] w-full flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
        <div className="flex max-w-md flex-col items-center text-center p-8 rounded-xl border bg-card shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-6">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Access Required</h2>
          <p className="text-sm text-muted-foreground mb-8">
            You need to be logged in to view and manage the campaign taxonomy governance workspace.
          </p>
          <Button 
            className="w-full sm:w-auto" 
            onClick={() => {
              window.location.href = `/api/login?returnTo=${encodeURIComponent('/taxonomy')}`;
            }}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Log in to continue
          </Button>
        </div>
      </div>
    );
  }

  if (isForbidden || !access.canRead) {
    return (
      <div className="flex h-[60vh] w-full flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
        <div className="flex max-w-md flex-col items-center text-center p-8 rounded-xl border bg-destructive/5 shadow-sm border-destructive/20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2 text-destructive">Permission Denied</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Your account ({access.role}) does not have permission to access the taxonomy workspace. Please contact a taxonomy administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TaxonomyAccessContext.Provider value={{ access }}>
      {children}
    </TaxonomyAccessContext.Provider>
  );
}
