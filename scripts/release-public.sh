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
  CLAUDE.md
  SAJOU-MANIFESTO.md
  .claude
  .mcp.json
  packages/theme-api
  packages/theme-citadel
  packages/theme-office
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

# Create orphan branch (no history)
git checkout --orphan _public-release

# Remove internal docs from index only
for path in "${EXCLUDE[@]}"; do
  if git ls-files --error-unmatch "$path" &>/dev/null; then
    git rm -r --cached "$path"
  fi
done

git commit -m "sajou — visual choreographer for AI agents"

# Resolve latest semver tag on main
LATEST_TAG=$(git tag --list 'v*' --sort=-version:refname | head -1)

# Push to public remote
git push public _public-release:main --force
if [ -n "$LATEST_TAG" ]; then
  git push public "refs/tags/$LATEST_TAG"
fi

# Cleanup — force checkout because git rm --cached left files on disk
git checkout -f main
git branch -D _public-release

echo "Done — pushed filtered main to public"
