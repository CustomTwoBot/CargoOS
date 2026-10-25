#!/bin/sh
# Points the iOS app at the same Convex deployment as `npx convex dev` (repo root .env.local).
# Writes ios/Config/Local.xcconfig (gitignored). Run again after switching deployments.
set -e
cd "$(dirname "$0")/.."
env_file="../.env.local"
[ -f "$env_file" ] || { echo "No $env_file. Run 'npx convex dev' in the repo root first." >&2; exit 1; }
url=$(grep -E '^(NEXT_PUBLIC_CONVEX_URL|CONVEX_URL)=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$url" ] || { echo "No NEXT_PUBLIC_CONVEX_URL in $env_file." >&2; exit 1; }
# xcconfig treats // as a comment, so the URL is written as https:/$()/host.
echo "CONVEX_URL = $(echo "$url" | sed 's#//#/$()/#')" > Config/Local.xcconfig
echo "iOS app now uses $url"
