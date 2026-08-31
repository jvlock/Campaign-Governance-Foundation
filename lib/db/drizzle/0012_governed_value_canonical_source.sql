ALTER TABLE "governed_values" ADD COLUMN IF NOT EXISTS "canonical_source_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "governed_values_canonical_source_key_unique"
  ON "governed_values" ("canonical_source_key")
  WHERE "canonical_source_key" IS NOT NULL;