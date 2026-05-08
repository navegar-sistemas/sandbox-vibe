#!/usr/bin/env bash
# When docker-compose.override.example.yml is edited and the change touches
# the plugin/MCP bootstrap area, the hook reports that the bootstrap-vN
# marker must be incremented so existing sandboxes re-bootstrap. Failing
# to bump the marker after such a change is a defect.

input=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  exit 0
fi

file_name=$(basename "$file_path" 2>/dev/null || echo "")
if [ "$file_name" != "docker-compose.override.example.yml" ]; then
  exit 0
fi

new_content=$(printf '%s' "$input" | jq -r '
  [
    .tool_input.content,
    .tool_input.new_string,
    ((.tool_input.edits // []) | map(.new_string) | join("\n"))
  ]
  | map(select(. != null and . != ""))
  | join("\n")
' 2>/dev/null)

if [ -z "$new_content" ]; then
  exit 0
fi

trigger=""
for needle in "enabledPlugins" "for p in" "claude mcp add" "claude plugin install" "claude plugin marketplace add"; do
  if printf '%s' "$new_content" | grep -q -- "$needle"; then
    trigger="$needle"
    break
  fi
done

if [ -z "$trigger" ]; then
  exit 0
fi

cat >&2 <<EOF
[hook:post_override_marker_check] Edit touched "$trigger".

  If the plugin/MCP list changed, the bootstrap marker MUST be incremented
  to force a re-bootstrap on existing sandboxes. Without the bump, the
  marker ~/.claude/.bootstrap-vN already recorded in the sandbox-home
  volume causes the entrypoint to skip the install step.

  Shortcut: run /bump-marker
  Manual:   grep -n 'bootstrap-v' docker-compose.override.example.yml
            and replace vN with v(N+1) at every occurrence.

  Failing to bump after a list change is a defect. It must be corrected
  before commit.
EOF

exit 0
