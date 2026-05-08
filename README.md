# vibe-sandbox

[![CI](https://github.com/navegar-sistemas/vibe-sandbox/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/navegar-sistemas/vibe-sandbox/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196.svg)](https://www.conventionalcommits.org)
[![Hadolint](https://img.shields.io/badge/lint-hadolint-22a7f0)](https://github.com/hadolint/hadolint)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Plug-and-play Docker sandbox for AI-assisted vibe coding — Claude Code running isolated, with idempotent plugin/MCP bootstrap and security limits enforced by default.

When you let an AI agent edit your code, three things must hold at the same time:

1. The agent **cannot** accidentally delete `~/`, leak macOS credentials, or run `rm -rf` on the host system.
2. The agent **can** read and write only on the projects you authorize.
3. You **don't waste time** reconfiguring plugins, MCPs and LSPs every time you spin up a new container.

`vibe-sandbox` is a 4-file template that delivers all three at once. It was extracted from a real stack (multi-project payment app — Flutter + .NET + PHP) and generalized to fit any project that uses Claude Code inside Docker.

---

## Layout

```
vibe-sandbox/
├── Dockerfile.sandbox                   # minimal base, tracked
├── docker-compose.sandbox.yml           # limits + base, tracked
├── Dockerfile.sandbox.override.example  # template — copy and edit
├── docker-compose.override.example.yml  # template — copy and edit
├── .gitignore                           # ignores the generated override.* files
├── LICENSE                              # MIT
└── README.md                            # you are here
```

Philosophy of the **base × override** split:

- **Base** (tracked): minimal, agnostic, the same for everyone. Defines the `vibe-sandbox-base:latest` image with `node:24-slim` + git/curl/python3 + non-root user + CPU/memory/PIDs limits and `cap_drop: ALL`.
- **Override** (gitignored): yours. Mounts of your projects, the plugin list you chose, MCPs, language servers for your stack, runtimes (Node ships in the base; .NET/Python/PHP/Go/Rust you add as needed).

You commit only what is generic. Anything personal (absolute paths, chosen plugins, runtimes) stays out of git.

---

## Quickstart via CLI (recommended)

The CLI handles setup automatically. From inside the project you want to sandbox:

```bash
npx @navegar-sistemas/vibe-sandbox init      # interactive wizard
npx @navegar-sistemas/vibe-sandbox up        # builds + runs the Claude REPL
```

The wizard asks for the workspace path, optional sibling mounts, stack (PHP / .NET / Python / Go / Rust LSP support), plugins, MCP servers, and resource limits. It writes the four sandbox files plus a `config.json` to `.vibe-sandbox/` in the project root and updates `.gitignore` accordingly.

Bootstrap is idempotent via a content-derived hash marker — changing the plugin or MCP list automatically triggers a re-bootstrap on the next `up`. To force a re-bootstrap without changing the config, run `npx @navegar-sistemas/vibe-sandbox bump-marker` and then `up`.

The CLI lives in [`cli/`](cli/) and is published as [`@navegar-sistemas/vibe-sandbox`](https://www.npmjs.com/package/@navegar-sistemas/vibe-sandbox) on npm. Source code, dependencies, and build configuration are all in that subdirectory.

---

## Quickstart manual (full control)

If you prefer to manage the files by hand:

### 1. Clone and enter

```bash
git clone https://github.com/navegar-sistemas/vibe-sandbox.git
cd vibe-sandbox
```

(Or use it as a GitHub template.)

### 2. Generate the local files

```bash
cp Dockerfile.sandbox.override.example  Dockerfile.sandbox.override
cp docker-compose.override.example.yml  docker-compose.override.yml
```

Both new files are in `.gitignore` — edit freely without worrying about leaking paths or keys.

### 3. Edit `docker-compose.override.yml`

Minimum required:

```yaml
volumes:
  - sandbox-home:/home/sandbox
  - /Users/YOUR_USER/path/to/your-project:/workspace        # ← edit this
```

If you have multiple related projects:

```yaml
volumes:
  - sandbox-home:/home/sandbox
  - /Users/YOUR_USER/path/to/main-project:/workspace
  - /Users/YOUR_USER/path/to/api:/workspace/api
  - /Users/YOUR_USER/path/to/worker:/workspace/worker
```

And expose them via `additionalDirectories` in the entrypoint:

```yaml
"additionalDirectories": [
  "/workspace",
  "/workspace/api",
  "/workspace/worker"
]
```

### 4. Build and run

```bash
docker compose -f docker-compose.sandbox.yml build --no-cache && \
docker compose -f docker-compose.sandbox.yml -f docker-compose.override.yml build --no-cache
```

Then:

```bash
docker compose -f docker-compose.sandbox.yml -f docker-compose.override.yml run --rm sandbox
```

The first run executes the bootstrap (installs marketplaces, plugins and MCPs into the `~/.claude` of the `sandbox-home` volume). Subsequent runs drop straight into the Claude Code REPL in milliseconds — bootstrap is recorded by a marker `~/.claude/.bootstrap-v1` and skipped from then on.

---

## Common customizations

### Add a language server

Each Claude Code LSP plugin needs its corresponding binary on the container's `PATH`. `Dockerfile.sandbox.override.example` already has commented blocks — uncomment the one for your stack:

| Stack | Plugin | Binary on PATH |
|---|---|---|
| PHP | `php-lsp` | `intelephense` (npm) |
| C# / .NET | `csharp-lsp` | `csharp-ls` (dotnet tool) |
| Python | `pyright-lsp` | `pyright` (npm) |
| Go | `gopls-lsp` | `gopls` (`go install`) |
| Rust | `rust-analyzer-lsp` | `rust-analyzer` (rustup) |
| C/C++ | `clangd-lsp` | `clangd` (apt) |

After uncommenting the Dockerfile block, also add the plugin to `enabledPlugins` AND to the `for p in ...` loop in the override.yml entrypoint.

### Add an MCP server

In the `docker-compose.override.yml` entrypoint, inside the `if [ ! -f .bootstrap-v1 ]` block, add before the `touch`:

```bash
claude mcp add NAME --scope user --transport http https://URL/mcp 2>&1 | tee -a "$$BOOT_LOG" | tail -1
```

Ready-to-use examples:

```bash
# context7 — up-to-date docs for libs/frameworks
claude mcp add context7 --scope user --transport http https://mcp.context7.com/mcp 2>&1 | tee -a "$$BOOT_LOG" | tail -1
```

When you change the plugin or MCP list after the sandbox has already run once, **bump the marker number**: replace `bootstrap-v1` with `bootstrap-v2` in every occurrence of the entrypoint. That forces a re-bootstrap on the next run.

### Change CPU/memory limits

Edit `docker-compose.sandbox.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: "8"           # default: 4
      memory: 8G          # default: 4G
      pids: 512           # default: 256
```

---

## How the bootstrap works

The override entrypoint is an inline bash script with 3 phases:

1. **Always** — writes `~/.claude/settings.json` with `permissions.additionalDirectories` (project mounts) and `enabledPlugins`. Overwriting on every run is intentional: it guarantees the source of truth for plugins is the entrypoint.
2. **First run only** (gated by `~/.claude/.bootstrap-v1`):
   - `claude plugin marketplace add obra/superpowers`
   - Loop of `claude plugin install <plugin>@<marketplace>` per item
   - `claude mcp add` per MCP
   - `touch ~/.claude/.bootstrap-v1` at the end
   - Everything under `set -e -o pipefail` — any failure aborts before the `touch`, so an incomplete run is not marked as "done"
   - Full log in `/tmp/sandbox-bootstrap.log` (tmpfs)
3. **Always** — `if [ -t 0 ]; then exec claude ...; else exit cleanly`. In an interactive terminal it opens the REPL. In CI/background it exits without the `Input must be provided either through stdin...` error.

---

## Security defaults

- **Non-root user** inside the container (`sandbox`)
- `cap_drop: ALL` — no extra Linux capabilities
- `no-new-privileges:true` — `setuid`/`setgid` disabled
- `network_mode: bridge` — internet yes, but no access to the host LAN
- `pids: 256` — process limit
- `tmpfs /tmp` — ephemeral between runs
- `sandbox-home` volume separated from the host's `~/.claude` — host credentials are not reachable from the container
- Plugins/MCPs stay isolated in the volume — installing or uninstalling inside the sandbox does not affect your host's Claude

---

## Troubleshooting

### "warning: skip creation of /usr/share/man/man1/...lzma..."
Comes from `xz-utils` on slim images without man pages. The `vibe-sandbox` base **does not** install `xz-utils` for that reason. If you added it in the override, the warning must be eliminated by creating `/usr/share/man/man1/` before the `apt-get install`. The repository treats warnings as defects of the same severity as errors; accepting or suppressing the warning is not a valid resolution.

### "The variable is not set. Defaulting to a blank string"
Compose interpolates `$VAR` in YAML strings. If you added bash variables in the entrypoint, escape them with `$$VAR` (two dollar signs). Applies to `$p`, `$BOOT_LOG`, any bash variable that appears inside a YAML string.

### "Tool 'csharp-ls' failed to install... DotnetToolSettings.xml"
The current `csharp-ls` version requires .NET 10+. If you uncommented the .NET block in `Dockerfile.override`, make sure you use `--channel 10.0` in `dotnet-install.sh` (not `8.0`).

### Bootstrap ran but plugins are missing
Confirm that the plugin names in the `for p in ...` loop match the ones listed in `enabledPlugins`. Both must use the same `name@marketplace`.

### Bootstrap was "skipped" but I changed the list
The marker `~/.claude/.bootstrap-v1` is recorded in the `sandbox-home` volume. Bump it to `bootstrap-v2` in the entrypoint, or delete it manually:

```bash
docker compose -f docker-compose.sandbox.yml -f docker-compose.override.yml run --rm \
  --entrypoint bash sandbox -c 'rm -f ~/.claude/.bootstrap-v1'
```

### The image is huge
The .NET SDK 10 alone adds ~250 MB. If you only need `csharp-ls` at runtime, keep it; otherwise comment the block out. Other common dependencies (intelephense, pyright) are lightweight.

---

## Origin

This template was extracted from the stack of project `casacredito-app` (multi-project app: Flutter + .NET + PHP, 9 sibling projects mounted in the same container, 11 plugins, 2 LSPs, 1 MCP). The generic version drops what was specific to that stack but preserves the architectural decisions that hold for any project:

- Base/override split with distinct `image:` per layer
- `set -e -o pipefail` in the entrypoint
- Idempotent bootstrap marker
- TTY detection before `exec claude`
- `tee` of the bootstrap log to `/tmp/sandbox-bootstrap.log`
- CPU/memory/PIDs limits enforced by default

---

## Contributing

PR flow, commit rules (Conventional Commits) and local setup are in [CONTRIBUTING.md](CONTRIBUTING.md).

Security vulnerabilities must be reported through the private channel — see [SECURITY.md](SECURITY.md). **Do not open a public issue for vulnerabilities.**

Questions, ideas and "what's the best way to X?" go to [GitHub Discussions](https://github.com/navegar-sistemas/vibe-sandbox/discussions). Bugs and feature requests go through the [issue tracker](https://github.com/navegar-sistemas/vibe-sandbox/issues/new/choose).

Change history in [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
