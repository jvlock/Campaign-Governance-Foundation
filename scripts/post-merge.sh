#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run repair:database
pnpm --filter @workspace/scripts run seed:taxonomy
