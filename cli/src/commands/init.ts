import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  type Config,
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  DEFAULT_RESOURCES,
  saveConfig,
} from "../config.js";
import { log } from "../log.js";
import {
  findVibeSandboxDir,
  vibeSandboxPath,
  VIBE_SANDBOX_DIR,
} from "../paths.js";
import { checkbox, confirm, input, select } from "../prompts.js";
import { computeMarker, renderAll } from "../render.js";

const STACK_CHOICES = [
  { name: "none", value: "none" as const },
  { name: "php (intelephense)", value: "php" as const },
  { name: "dotnet (csharp-ls)", value: "dotnet" as const },
  { name: "python (pyright)", value: "python" as const },
  { name: "go (gopls)", value: "go" as const },
  { name: "rust (rust-analyzer)", value: "rust" as const },
];

export type InitOptions = {
  force?: boolean;
  nonInteractive?: boolean;
};

export async function init(opts: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const existingDir = findVibeSandboxDir(cwd);

  if (existingDir && !opts.force) {
    if (opts.nonInteractive) {
      throw new Error(
        `${VIBE_SANDBOX_DIR}/ already exists. Use --force to overwrite.`,
      );
    }
    const overwrite = await confirm({
      message: `${VIBE_SANDBOX_DIR}/ already exists. Overwrite?`,
      default: false,
    });
    if (!overwrite) {
      log("Aborted by user.");
      return;
    }
  }

  const config = opts.nonInteractive
    ? buildDefaultConfig(cwd)
    : await runWizard(cwd);
  config.marker = computeMarker(config);

  const destDir = vibeSandboxPath(cwd);
  // mkdirSync with `recursive: true` is idempotent — no need for an existsSync guard.
  mkdirSync(destDir, { recursive: true });
  await renderAll(destDir, config);
  saveConfig(destDir, config);

  if (!opts.nonInteractive) {
    await maybeUpdateGitignore(cwd);
  }

  log(`Wrote ${VIBE_SANDBOX_DIR}/ with marker ${config.marker}.`);
  log("Run 'vibe-sandbox up' to start the sandbox.");
}

function buildDefaultConfig(cwd: string): Config {
  return {
    schemaVersion: 1,
    workspacePath: cwd,
    additionalMounts: [],
    resources: { ...DEFAULT_RESOURCES },
    stack: "none",
    plugins: [...DEFAULT_PLUGINS],
    marketplaces: [...DEFAULT_MARKETPLACES],
    mcps: [],
    marker: "",
  };
}

async function runWizard(cwd: string): Promise<Config> {
  const workspacePath = await input({
    message: "Workspace path (mounted as /workspace)",
    default: cwd,
    validate: (value) => {
      const absolute = resolve(value);
      if (!existsSync(absolute)) return `Path does not exist: ${absolute}`;
      return true;
    },
  });

  const additionalMounts = await promptAdditionalMounts();

  const stack = await select({
    message: "Stack for LSP support",
    choices: STACK_CHOICES,
    default: "none",
  });

  const plugins = await checkbox({
    message: "Plugins to enable",
    choices: DEFAULT_PLUGINS.map((p) => ({
      name: p,
      value: p,
      checked: true,
    })),
  });

  const mcps = await promptMcps();

  const useDefaults = await confirm({
    message: `Use default resources (${DEFAULT_RESOURCES.cpus} CPU, ${DEFAULT_RESOURCES.memoryGB}G mem, ${DEFAULT_RESOURCES.pids} PIDs, ${DEFAULT_RESOURCES.tmpfsMB}M tmpfs)?`,
    default: true,
  });
  const resources = useDefaults
    ? { ...DEFAULT_RESOURCES }
    : await promptResources();

  return {
    schemaVersion: 1,
    workspacePath: resolve(workspacePath),
    additionalMounts,
    resources,
    stack,
    plugins,
    marketplaces: [...DEFAULT_MARKETPLACES],
    mcps,
    marker: "",
  };
}

async function promptAdditionalMounts(): Promise<Config["additionalMounts"]> {
  const mounts: Config["additionalMounts"] = [];
  let addMore = await confirm({
    message: "Add sibling mounts?",
    default: false,
  });
  while (addMore) {
    const hostPath = await input({
      message: "Host path (absolute)",
      validate: (value) => {
        const absolute = resolve(value);
        if (!existsSync(absolute)) return `Path does not exist: ${absolute}`;
        return true;
      },
    });
    const defaultContainerPath = `/workspace/${basename(resolve(hostPath))}`;
    const containerPath = await input({
      message: "Container path",
      default: defaultContainerPath,
    });
    const readonly = await confirm({
      message: "Read-only?",
      default: false,
    });
    mounts.push({ hostPath: resolve(hostPath), containerPath, readonly });
    addMore = await confirm({
      message: "Add another mount?",
      default: false,
    });
  }
  return mounts;
}

async function promptMcps(): Promise<Config["mcps"]> {
  const mcps: Config["mcps"] = [];
  const addMcp = await confirm({
    message: "Add MCP servers?",
    default: false,
  });
  if (!addMcp) return mcps;

  let more = true;
  while (more) {
    const name = await input({
      message: "MCP name",
      default: "context7",
    });
    const url = await input({
      message: "MCP URL",
      default:
        name === "context7" ? "https://mcp.context7.com/mcp" : "",
    });
    mcps.push({ name, transport: "http", url });
    more = await confirm({
      message: "Add another MCP?",
      default: false,
    });
  }
  return mcps;
}

async function promptResources(): Promise<Config["resources"]> {
  const cpus = await promptPositiveNumber(
    "CPU limit (count)",
    DEFAULT_RESOURCES.cpus,
    false,
  );
  const memoryGB = await promptPositiveNumber(
    "Memory limit (GB)",
    DEFAULT_RESOURCES.memoryGB,
    false,
  );
  const pids = await promptPositiveNumber(
    "PID limit",
    DEFAULT_RESOURCES.pids,
    true,
  );
  const tmpfsMB = await promptPositiveNumber(
    "tmpfs /tmp size (MB)",
    DEFAULT_RESOURCES.tmpfsMB,
    true,
  );
  return { cpus, memoryGB, pids, tmpfsMB };
}

async function promptPositiveNumber(
  message: string,
  defaultValue: number,
  integer: boolean,
): Promise<number> {
  const raw = await input({
    message,
    default: String(defaultValue),
    validate: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return "must be > 0";
      if (integer && !Number.isInteger(n)) return "must be an integer";
      return true;
    },
  });
  return Number(raw);
}

async function maybeUpdateGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, ".gitignore");
  const entry = `/${VIBE_SANDBOX_DIR}/`;

  if (!existsSync(gitignorePath)) {
    const create = await confirm({
      message: `No .gitignore found. Create one with '${entry}'?`,
      default: true,
    });
    if (create) {
      writeFileSync(gitignorePath, entry + "\n", "utf-8");
      log("Created .gitignore.");
    }
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  if (content.split(/\r?\n/).some((line) => line.trim() === entry)) {
    return;
  }
  const add = await confirm({
    message: `Add '${entry}' to .gitignore?`,
    default: true,
  });
  if (add) {
    const trailing = content.endsWith("\n") ? "" : "\n";
    writeFileSync(gitignorePath, content + trailing + entry + "\n", "utf-8");
    log("Updated .gitignore.");
  }
}
