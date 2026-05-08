#!/usr/bin/env bash
# Surfaces, at PreToolUse time, that the base layer (Dockerfile.sandbox,
# docker-compose.sandbox.yml) must remain generic. The hook cannot evaluate
# the post-edit content at this point in the lifecycle; the agent is
# responsible for honoring the rule. Any deviation introduced by the edit
# is a defect that must be reverted or relocated before commit.
# See ../../.claude/CLAUDE.md "Base and override separation".

input=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  exit 0
fi

file_name=$(basename "$file_path" 2>/dev/null || echo "")

case "$file_name" in
  Dockerfile.sandbox|docker-compose.sandbox.yml)
    cat >&2 <<EOF
[hook:pre_base_edit_warn] Editing a BASE-layer file: $file_name

  The base is tracked and generic. It must not contain:
    - absolute host paths
    - stack-specific plugins, MCPs, or runtimes
    - credentials or project identifiers

  Stack-specific changes belong in *.override.example (tracked, didactic)
  or *.override (gitignored, real). See .claude/CLAUDE.md "Base and override
  separation". Any deviation introduced by this edit is a defect that must
  be reverted or relocated before commit.
EOF
    ;;
esac

exit 0
