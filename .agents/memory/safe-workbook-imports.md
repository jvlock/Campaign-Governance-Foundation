---
name: Safe workbook imports
description: Captures the security and performance constraints for preserved taxonomy workbook parsing.
---

Parse only the required Office Open XML worksheet parts from preserved `.xlsx` and `.xlsm` files. Do not reintroduce the unpatched `xlsx` package or a whole-workbook object-model loader.

**Why:** Publishing blocks known high-severity dependency vulnerabilities, and loading the entire macro-enabled taxonomy workbook is needlessly slow when imports use only named worksheets.

**How to apply:** Keep workbook sources unchanged, resolve named sheets through workbook relationships, decode shared strings and cell values, and retain tests for the explicit `na` conflict and source locations.