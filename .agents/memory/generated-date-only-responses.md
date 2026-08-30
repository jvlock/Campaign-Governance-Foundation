---
name: Generated date-only responses
description: Calendar-safe handling for OpenAPI date fields after generated server validation.
---

Treat API fields declared as OpenAPI `format: date` as calendar dates, but normalize received values to their first 10 ISO characters before string comparison or UTC-day arithmetic.

**Why:** Generated server validators can coerce date-only values to JavaScript `Date` objects, which JSON serializes as midnight timestamps. Appending another time suffix then produces invalid dates and `NaN` coverage calculations.

**How to apply:** For fiscal boundaries and other date-only domain values, isolate `YYYY-MM-DD` at the UI boundary before comparisons, inclusive-day counts, or display. Do not reinterpret the value in the browser's local timezone.