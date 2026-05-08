import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Stack = "none" | "php" | "dotnet" | "python" | "go" | "rust";

export type AdditionalMount = {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
};

export type Resources = {
  cpus: number;
  memoryGB: number;
  pids: number;
  tmpfsMB: number;
};

export type Mcp = {
  name: string;
  transport: "http" | "sse";
  url: string;
};

export type Config = {
  schemaVersion: 1;
  workspacePath: string;
  additionalMounts: AdditionalMount[];
  resources: Resources;
  stack: Stack;
  plugins: string[];
  marketplaces: string[];
  mcps: Mcp[];
  marker: string;
};

export const CONFIG_FILE_NAME = "config.json";

export const STACKS: readonly Stack[] = [
  "none",
  "php",
  "dotnet",
  "python",
  "go",
  "rust",
];

export const DEFAULT_PLUGINS: string[] = [
  "security-guidance@claude-plugins-official",
  "commit-commands@claude-plugins-official",
  "code-review@claude-plugins-official",
  "pr-review-toolkit@claude-plugins-official",
  "claude-md-management@claude-plugins-official",
  "hookify@claude-plugins-official",
  "feature-dev@claude-plugins-official",
  "superpowers@superpowers-dev",
];

export const DEFAULT_MARKETPLACES: string[] = [
  "anthropics/claude-plugins-official",
  "obra/superpowers",
];

export const DEFAULT_RESOURCES: Resources = {
  cpus: 4,
  memoryGB: 4,
  pids: 256,
  tmpfsMB: 512,
};

export function loadConfig(vibeDir: string): Config {
  const configPath = join(vibeDir, CONFIG_FILE_NAME);
  const raw = readFileSync(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  validateConfig(parsed);
  return parsed;
}

export function saveConfig(vibeDir: string, config: Config): void {
  const configPath = join(vibeDir, CONFIG_FILE_NAME);
  writeFileSync(
    configPath,
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}

function validateConfig(value: unknown): asserts value is Config {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("config.json: expected an object at the root.");
  }
  const cfg = value as Record<string, unknown>;

  if (cfg.schemaVersion !== 1) {
    throw new Error(
      `config.json: unsupported schemaVersion ${String(cfg.schemaVersion)}; expected 1.`,
    );
  }
  if (typeof cfg.workspacePath !== "string" || cfg.workspacePath.length === 0) {
    throw new Error("config.json: workspacePath must be a non-empty string.");
  }
  if (typeof cfg.marker !== "string" || cfg.marker.length === 0) {
    throw new Error("config.json: marker must be a non-empty string.");
  }
  if (
    typeof cfg.stack !== "string" ||
    !(STACKS as readonly string[]).includes(cfg.stack)
  ) {
    throw new Error(
      `config.json: stack must be one of ${STACKS.join("/")}; got ${String(cfg.stack)}.`,
    );
  }
  if (
    !Array.isArray(cfg.plugins) ||
    cfg.plugins.some((p) => typeof p !== "string")
  ) {
    throw new Error("config.json: plugins must be an array of strings.");
  }
  if (
    !Array.isArray(cfg.marketplaces) ||
    cfg.marketplaces.some((m) => typeof m !== "string")
  ) {
    throw new Error("config.json: marketplaces must be an array of strings.");
  }
  if (!Array.isArray(cfg.mcps) || !cfg.mcps.every(isMcp)) {
    throw new Error(
      "config.json: mcps must be an array of { name: string, transport: 'http'|'sse', url: string }.",
    );
  }
  if (
    !Array.isArray(cfg.additionalMounts) ||
    !cfg.additionalMounts.every(isAdditionalMount)
  ) {
    throw new Error(
      "config.json: additionalMounts must be an array of { hostPath: string, containerPath: string, readonly: boolean }.",
    );
  }
  if (!isResources(cfg.resources)) {
    throw new Error(
      "config.json: resources must be { cpus, memoryGB, pids, tmpfsMB } with positive numbers (pids and tmpfsMB must be integers).",
    );
  }
}

function isMcp(value: unknown): value is Mcp {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.url === "string" &&
    (obj.transport === "http" || obj.transport === "sse")
  );
}

function isAdditionalMount(value: unknown): value is AdditionalMount {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.hostPath === "string" &&
    typeof obj.containerPath === "string" &&
    typeof obj.readonly === "boolean"
  );
}

function isResources(value: unknown): value is Resources {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.cpus === "number" &&
    Number.isFinite(obj.cpus) &&
    obj.cpus > 0 &&
    typeof obj.memoryGB === "number" &&
    Number.isFinite(obj.memoryGB) &&
    obj.memoryGB > 0 &&
    typeof obj.pids === "number" &&
    Number.isInteger(obj.pids) &&
    obj.pids > 0 &&
    typeof obj.tmpfsMB === "number" &&
    Number.isInteger(obj.tmpfsMB) &&
    obj.tmpfsMB > 0
  );
}
