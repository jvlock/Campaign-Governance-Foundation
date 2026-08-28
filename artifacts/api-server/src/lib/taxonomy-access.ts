import { count, eq } from "drizzle-orm";
import { db, taxonomyUserRolesTable } from "@workspace/db";

export type TaxonomyRole = "reader" | "contributor" | "reviewer" | "steward" | "administrator";

const rank: Record<TaxonomyRole, number> = {
  reader: 0,
  contributor: 1,
  reviewer: 2,
  steward: 3,
  administrator: 4,
};

export async function getOrBootstrapAccess(userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute("select pg_advisory_xact_lock(hashtext('taxonomy-role-bootstrap'))");
    const [existing] = await tx.select().from(taxonomyUserRolesTable)
      .where(eq(taxonomyUserRolesTable.userId, userId));
    if (existing) return existing;

    const [roleCount] = await tx.select({ count: count() }).from(taxonomyUserRolesTable);
    if (Number(roleCount?.count ?? 0) > 0) return null;
    const [created] = await tx.insert(taxonomyUserRolesTable)
      .values({ userId, role: "administrator", categories: [] })
      .returning();
    return created;
  });
}

export function hasRole(role: string, required: TaxonomyRole) {
  return (rank[role as TaxonomyRole] ?? -1) >= rank[required];
}

export function allowsCategory(categories: string[], category: string) {
  return categories.length === 0 || categories.includes(category);
}

export function toAccess(role: string, categories: string[]) {
  return {
    role,
    canRead: hasRole(role, "reader"),
    canPropose: hasRole(role, "contributor"),
    canReview: hasRole(role, "reviewer"),
    canActivate: hasRole(role, "steward"),
    canAdminister: hasRole(role, "administrator"),
    categories,
  };
}