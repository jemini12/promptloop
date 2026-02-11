#!/usr/bin/env bash
set -euo pipefail

if grep -R -n -E --include="*.tsx" '<Link[^>]*onClick=' src; then
  echo "Found action-like Link usage with onClick"
  exit 1
fi

if grep -R -n -E --include="*.tsx" '<Link[^>]*className="[^"]*(bg-zinc-900|shadow-sm|rounded-lg)' src/app src/components; then
  echo "Found ad-hoc button-styled Link usage"
  exit 1
fi

if grep -R -n -E --include="*.tsx" '<button[^>]*className="' src/app src/components; then
  echo "Found raw button class usage"
  exit 1
fi

echo "UI control checks passed"
