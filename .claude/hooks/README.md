# `.claude/hooks/`

Project hooks that surface architectural rule violations defined in [`.claude/CLAUDE.md`](../CLAUDE.md). Any rule violation surfaced by a hook is a defect that must be corrected before the affected change is committed; the repository treats warnings and errors with the same severity, and the hooks make no exception to that rule.

The hooks render rule violations visible at the moment of action. Mechanically, a `PostToolUse` hook cannot block a tool call after it has occurred — that is a property of the hook contract, not a tolerance level. The agent is responsible for honoring any violation surfaced by a hook and for ceasing further work on the change until the violation is fixed.

## Dependencies

Hooks degrade gracefully when the following are unavailable:

- `jq` — JSON parsing of the hook stdin payload.
- `docker` — required by `post_yml_validate.sh`.
- `git` — used by `post_yml_validate.sh` for repository-root resolution.

If any required tool is missing, the hook exits 0 silently rather than failing the parent tool call.

## Installed hooks

### `pre_base_edit_warn.sh` — PreToolUse

Fires before `Edit`, `Write`, or `MultiEdit`. If the target file is `Dockerfile.sandbox` or `docker-compose.sandbox.yml` (the base layer, tracked), the hook prints a notice that the base must remain generic — no project paths, no plugin choices, no specific runtimes. Stack-specific changes belong in `*.override.example` (or `*.override`, which is gitignored).

The hook does not block by exit code, because at PreToolUse time the proposed edit content has not yet been applied and cannot be validated against the rule. The agent is required to ensure the resulting edit honors the rule; any deviation introduced by the edit is a defect, not a permitted exception.

### `post_yml_validate.sh` — PostToolUse

Fires after `Edit`, `Write`, or `MultiEdit` on any `docker-compose*.yml` file. Runs `docker compose -f docker-compose.sandbox.yml config --quiet` and surfaces any output. The compose configuration validation catches indentation issues, missing colons, and undefined `$VAR` interpolations resulting from a missing `$$` escape. Any output emitted by the validation — including a warning — is a defect that must be fixed before the change is committed.

If `docker` is unavailable, the hook is a no-op.

### `post_override_marker_check.sh` — PostToolUse

Fires after edits to `docker-compose.override.example.yml`. The hook inspects the inserted content for any of the following tokens:

- `enabledPlugins`
- `for p in`
- `claude plugin install`
- `claude plugin marketplace add`
- `claude mcp add`

If any token appears, the hook reports that the bootstrap marker (`bootstrap-vN` → `bootstrap-v(N+1)`) must be incremented so existing sandboxes will re-bootstrap. Failing to bump the marker after such a change is a defect; the `/bump-marker` command exists to perform the increment.

## Adding a hook

1. Place the script in this directory and make it executable (`chmod +x`).
2. Register it under `hooks.PreToolUse` or `hooks.PostToolUse` in `.claude/settings.json` with a `matcher` regular expression against the tool name.
3. Update this README with what the hook does and which rule in `.claude/CLAUDE.md` it backs.
4. The hook must surface every violation; it must not pre-classify findings as severe or minor.

## Hook stdin contract

Each hook receives a single JSON object on stdin:

```json
{
  "hook_event_name": "PreToolUse" | "PostToolUse",
  "tool_name": "Edit" | "Write" | "MultiEdit" | "...",
  "tool_input": { "file_path": "...", "new_string": "...", ... },
  "session_id": "...",
  "transcript_path": "..."
}
```

Output written to stderr is shown to the agent. Exit code 0 indicates continuation. For `PreToolUse`, exit code 2 blocks the operation; the hooks in this directory do not currently use exit code 2 because they cannot evaluate the post-edit state at that point in the lifecycle.
