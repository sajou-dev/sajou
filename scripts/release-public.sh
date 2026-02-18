#!/usr/bin/env bash
set -euo pipefail

# Folders/files to exclude from public remote
EXCLUDE=(
  docs/backlog
  docs/active
  docs/done
  docs/decisions
  docs/marketing
  docs/brand
  docs/archive
  docs/sajou-mcp-server-design.md
)

# Checks
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main (currently on $BRANCH)" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree not clean — commit or stash first" >&2
  exit 1
fi

# Create temp branch
git checkout -b _public-release

# Remove internal docs from index only
for path in "${EXCLUDE[@]}"; do
  if git ls-files --error-unmatch "$path" &>/dev/null; then
    git rm -r --cached "$path"
  fi
done

git commit -m "release: filtered tree for public"

# Push to public remote
git push public _public-release:main --force
git push public --tags

# Cleanup — force checkout because git rm --cached left files on disk
git checkout -f main
git branch -D _public-release

echo "Done — pushed filtered main to public"
