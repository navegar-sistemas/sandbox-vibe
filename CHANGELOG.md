# Changelog

All notable changes to `vibe-sandbox` will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `cli/` package published to npm as `@navegar-sistemas/vibe-sandbox` — a TypeScript CLI that replaces the 9-step manual setup with two commands (`vibe-sandbox init` + `vibe-sandbox up`). The `init` wizard asks for workspace path, additional mounts, stack (none / php / dotnet / python / go / rust), plugins, MCP servers, and resource limits, then generates the four sandbox files and a `config.json` under `.vibe-sandbox/`. The bootstrap marker is auto-derived from a SHA-8 hash of plugins, marketplaces, and MCPs — any change to those lists triggers an automatic re-bootstrap on the next `up`. A `bump-marker` command remains as an escape hatch for forced re-bootstrap. The CLI is additive: the manual setup below remains fully supported.
- Initial public release of the `vibe-sandbox` template.
- Base image (`vibe-sandbox-base:latest`) on `node:24-slim` with `git`, `curl`, `ca-certificates`, `openssh-client`, `python3`, `unzip`, `zip`.
- Non-root `sandbox` user inside the container.
- `docker-compose.sandbox.yml` with hardened defaults: `cap_drop: ALL`, `no-new-privileges`, `network_mode: bridge`, `pids: 256`, CPU/memory limits, and `tmpfs /tmp`.
- `Dockerfile.sandbox.override.example` with optional commented blocks for PHP (intelephense), C# / .NET (csharp-ls), Python (pyright), Go (gopls), and Rust (rust-analyzer).
- `docker-compose.override.example.yml` with idempotent bootstrap entrypoint (marker `~/.claude/.bootstrap-v1`), `set -e -o pipefail` discipline, TTY detection before `exec claude`, and tee'd bootstrap log at `/tmp/sandbox-bootstrap.log`.
- `.gitignore` covering generated overrides, common editor temp files, and runtime artifacts.
- README with quickstart, customization recipes, troubleshooting, and architectural rationale.
- `CONTRIBUTING.md` with ground rules, PR flow, and Conventional Commits guide.
- `SECURITY.md` with private vulnerability reporting policy.
- `.claude/CLAUDE.md` with guidance for Claude Code agents working on the template, including the repository-wide rule that warnings are defects of the same severity as errors (no intermediate severity is tolerated between approval and blocking) and the explicit recognition that the AI-governance tooling under `.claude/` is cooperative rather than adversarial.
- `SECURITY.md` "Threat model boundary" section documenting that `vibe-sandbox` controls the agent inside the container (Docker-enforced) but not an agent editing the template repository itself; the latter is governed by branch protection, CODEOWNERS, server-side CI, and human review.
- `.github/CODEOWNERS` extended to cover AI-governance surfaces (`.claude/CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`) and lint configuration (`.hadolint.yaml`, `.markdownlint.jsonc`, `.editorconfig`); changes to these files require explicit owner review.
- GitHub Actions CI: hadolint, `docker compose config`, markdownlint, gitleaks, build smoke test.
- Dependabot configuration for Docker base image and GitHub Actions updates.
- Issue and pull request templates.

[Unreleased]: https://github.com/navegar-sistemas/vibe-sandbox/compare/HEAD...HEAD
