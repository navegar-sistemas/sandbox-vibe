---
description: Bump the bootstrap idempotency marker (bootstrap-vN to vN+1) in docker-compose.override.example.yml
allowed-tools: Read, Edit, Bash(grep:*), Bash(git diff:*)
argument-hint: [optional explicit new version, e.g. "v3"]
---

You are bumping the bootstrap marker in `docker-compose.override.example.yml` so that any sandbox already populated with the old marker will re-bootstrap on next run.

## Steps

1. **Locate references**
   `grep -nE 'bootstrap-v[0-9]+' docker-compose.override.example.yml`
   Show every match line.

2. **Identify current N**
   - Extract the version number from each match.
   - All matches must share the same `N`. If they differ, FAIL with the message: "Inconsistent marker versions in file. Lines X have vA, lines Y have vB. Fix the file by hand before bumping."

3. **Compute target N+1**
   - If the user passed an argument like `v3`, use that explicit version.
   - Otherwise increment: vN → v(N+1).

4. **Edit**
   Use the `Edit` tool with `replace_all: true` to swap `bootstrap-v<old>` for `bootstrap-v<new>` everywhere in the file.

5. **Verify**
   `grep -nE 'bootstrap-v[0-9]+' docker-compose.override.example.yml`
   Confirm every match is now the new version. Confirm count of matches is the same as step 1 (no accidental loss).

6. **Show diff**
   `git diff -- docker-compose.override.example.yml`
   So the user sees exactly what changed.

7. **Reminders**
   Print a final block:

   ```text
   Marker bumped: vN -> v(N+1).
   Effects:
     - Sandboxes built before this change will re-bootstrap on next run
       (re-install plugins/MCPs, re-write settings.json from entrypoint).
     - First run after this bump takes the longer bootstrap path; subsequent
       runs are fast again.

   Next steps:
     - Update CHANGELOG.md under [Unreleased] noting the bump and what
       triggered it (which plugin/MCP changed).
     - Commit with: chore(bootstrap): bump marker to v(N+1)
   ```

## Constraints

- Only edit `docker-compose.override.example.yml`. Do NOT touch `settings.json`, `.claude/CLAUDE.md`, `README.md`, or any other file.
- Do NOT auto-commit. The user controls when commits happen.
- If the file does not exist or has zero `bootstrap-v` matches, FAIL early with a clear message. Do not silently no-op.
