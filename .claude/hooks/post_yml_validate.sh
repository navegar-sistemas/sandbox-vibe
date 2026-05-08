#!/usr/bin/env bash
# Runs `docker compose config` after any edit to a docker-compose*.yml file
# in this repository. Surfaces syntax errors and unset-variable warnings,
# the latter typically indicating a bash variable that was not escaped as
# $$VAR. Any output emitted by the validation — including a warning — is a
# defect that must be fixed before the change is committed.

input=$(cat)

if ! command -v jq >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
  exit 0
fi

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  exit 0
fi

file_name=$(basename "$file_path" 2>/dev/null || echo "")

case "$file_name" in
  docker-compose.sandbox.yml|docker-compose.override.yml|docker-compose.override.example.yml)
    ;;
  *)
    exit 0
    ;;
esac

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
base="$repo_root/docker-compose.sandbox.yml"
[ -f "$base" ] || exit 0

cd "$repo_root" || exit 0

output=$(docker compose -f docker-compose.sandbox.yml config --quiet 2>&1)
rc=$?

if [ "$rc" -ne 0 ] || [ -n "$output" ]; then
  cat >&2 <<EOF
[hook:post_yml_validate] docker compose config after edit on $file_name (rc=$rc):
$output

Any output above is a defect. The repository treats compose warnings and
errors with the same severity. Fix the file before committing.
EOF
fi

exit 0
