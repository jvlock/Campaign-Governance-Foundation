import { createContext, useContext, ReactNode } from "react";
import type { TaxonomyAccess } from "@workspace/api-client-react";

interface TaxonomyAccessContextValue {
  access: TaxonomyAccess;
}

const TaxonomyAccessContext = createContext<TaxonomyAccessContextValue | null>(null);
const PUBLIC_ACCESS: TaxonomyAccess = {
  role: "administrator",
  canRead: true,
  canPropose: true,
  canReview: true,
  canActivate: true,
  canAdminister: true,
  categories: [],
};

export function useTaxonomyAccess() {
  const context = useContext(TaxonomyAccessContext);
  if (!context) {
    throw new Error("useTaxonomyAccess must be used within a TaxonomyGuard");
  }
  return context.access;
}

export function TaxonomyGuard({ children }: { children: ReactNode }) {
  return (
    <TaxonomyAccessContext.Provider value={{ access: PUBLIC_ACCESS }}>
      {children}
    </TaxonomyAccessContext.Provider>
  );
}
