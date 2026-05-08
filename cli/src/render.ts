import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, Stack } from "./config.js";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
);

export const TEMPLATE_FILES = {
  baseDockerfile: {
    template: "Dockerfile.sandbox.tpl",
    output: "Dockerfile.sandbox",
  },
  baseCompose: {
    template: "docker-compose.sandbox.yml.tpl",
    output: "docker-compose.sandbox.yml",
  },
  overrideDockerfile: {
    template: "Dockerfile.sandbox.override.tpl",
    output: "Dockerfile.sandbox.override",
  },
  overrideCompose: {
    template: "docker-compose.override.yml.tpl",
    output: "docker-compose.override.yml",
  },
} as const;

export async function renderTemplate(
  templateName: string,
  vars: Record<string, string>,
): Promise<string> {
  const tplPath = join(TEMPLATES_DIR, templateName);
  const tpl = await readFile(tplPath, "utf-8");
  const lookup = (key: string): string => getRequiredVar(vars, key, templateName);

  // Pass 1: whole-line comment markers `# vibe-render:NAME`. Used in
  // Dockerfile templates so the placeholder is a syntactically valid
  // comment and Dockerfile language servers do not flag it as an unknown
  // instruction. The marker line is replaced entirely by the variable
  // value (which itself can be multi-line).
  const afterCommentMarkers = tpl.replace(
    /^[ \t]*# vibe-render:(\w+)[ \t]*$/gm,
    (_match: string, key: string) => lookup(key),
  );

  // Pass 2: inline `${name}` placeholders for scalar values that must sit
  // inside an expression (compose YAML keys, the bootstrap marker name).
  return afterCommentMarkers.replace(
    /\$\{(\w+)\}/g,
    (_match: string, key: string) => lookup(key),
  );
}

function getRequiredVar(
  vars: Record<string, string>,
  key: string,
  templateName: string,
): string {
  const value = vars[key];
  if (value === undefined) {
    throw new Error(`Template ${templateName}: missing variable '${key}'.`);
  }
  return value;
}

export async function writeRendered(
  destDir: string,
  outputName: string,
  content: string,
): Promise<void> {
  await writeFile(join(destDir, outputName), content, "utf-8");
}

export function computeMarker(config: Config): string {
  const canonical = JSON.stringify({
    plugins: [...config.plugins].sort(),
    marketplaces: [...config.marketplaces].sort(),
    mcps: [...config.mcps]
      .map((m) => ({ name: m.name, transport: m.transport, url: m.url }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  return `bootstrap-${hash}`;
}

export function renderVolumesBlock(config: Config): string {
  const lines: string[] = [
    "      - sandbox-home:/home/sandbox",
    `      - ${config.workspacePath}:/workspace`,
  ];
  for (const m of config.additionalMounts) {
    const ro = m.readonly ? ":ro" : "";
    lines.push(`      - ${m.hostPath}:${m.containerPath}${ro}`);
  }
  return lines.join("\n");
}

export function renderAdditionalDirsBlock(config: Config): string {
  const dirs: string[] = ["/workspace"];
  for (const m of config.additionalMounts) {
    dirs.push(m.containerPath);
  }
  return JSON.stringify(dirs, null, 2).replace(/\n/g, "\n            ");
}

export function renderEnabledPluginsBlock(config: Config): string {
  const obj: Record<string, true> = {};
  for (const p of config.plugins) obj[p] = true;
  return JSON.stringify(obj, null, 2).replace(/\n/g, "\n          ");
}

export function renderMarketplacesBlock(config: Config): string {
  if (config.marketplaces.length === 0) {
    return "";
  }
  return config.marketplaces
    .map(
      (m) =>
        `          claude plugin marketplace add ${m} 2>&1 | tee -a "$$BOOT_LOG" | tail -1`,
    )
    .join("\n");
}

export function renderPluginLoopBlock(config: Config): string {
  if (config.plugins.length === 0) {
    return `            ""`;
  }
  return config.plugins
    .map((p, idx) => {
      const continuation = idx === config.plugins.length - 1 ? "" : " \\";
      return `            "${p}"${continuation}`;
    })
    .join("\n");
}

export function renderMcpsBlock(config: Config): string {
  if (config.mcps.length === 0) {
    return "";
  }
  const lines = config.mcps.map(
    (m) =>
      `          claude mcp add ${m.name} --scope user --transport ${m.transport} ${m.url} 2>&1 | tee -a "$$BOOT_LOG" | tail -1`,
  );
  return "\n" + lines.join("\n") + "\n";
}

export function renderStackBlock(stack: Stack): string {
  switch (stack) {
    case "none":
      return "# (no extra stack selected)";
    case "php":
      return [
        "# PHP intelephense (php-lsp plugin)",
        "RUN npm install -g intelephense",
      ].join("\n");
    case "dotnet":
      return [
        "# C# / .NET csharp-ls (csharp-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends wget ca-certificates libicu72 \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && wget -qO /tmp/dotnet-install.sh https://dot.net/v1/dotnet-install.sh \\",
        " && chmod +x /tmp/dotnet-install.sh \\",
        " && /tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet \\",
        " && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \\",
        " && rm /tmp/dotnet-install.sh \\",
        " && DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 \\",
        "    dotnet tool install --tool-path /usr/local/bin csharp-ls",
      ].join("\n");
    case "python":
      return [
        "# Python pyright (pyright-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends python3-pip \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && npm install -g pyright",
      ].join("\n");
    case "go":
      return [
        "# Go gopls (gopls-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends golang-go \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && go install golang.org/x/tools/gopls@latest",
      ].join("\n");
    case "rust":
      return [
        "# Rust rust-analyzer (rust-analyzer-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends rustup \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && rustup-init -y --default-toolchain stable \\",
        " && /root/.cargo/bin/rustup component add rust-analyzer",
      ].join("\n");
  }
}

export async function renderAll(
  destDir: string,
  config: Config,
): Promise<void> {
  const baseDockerfile = await renderTemplate(
    TEMPLATE_FILES.baseDockerfile.template,
    {},
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.baseDockerfile.output,
    baseDockerfile,
  );

  const baseCompose = await renderTemplate(
    TEMPLATE_FILES.baseCompose.template,
    {
      cpus: String(config.resources.cpus),
      memoryGB: String(config.resources.memoryGB),
      pids: String(config.resources.pids),
      tmpfsMB: String(config.resources.tmpfsMB),
    },
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.baseCompose.output,
    baseCompose,
  );

  const overrideDockerfile = await renderTemplate(
    TEMPLATE_FILES.overrideDockerfile.template,
    {
      stackBlock: renderStackBlock(config.stack),
    },
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.overrideDockerfile.output,
    overrideDockerfile,
  );

  const overrideCompose = await renderTemplate(
    TEMPLATE_FILES.overrideCompose.template,
    {
      volumesBlock: renderVolumesBlock(config),
      additionalDirsBlock: renderAdditionalDirsBlock(config),
      enabledPluginsBlock: renderEnabledPluginsBlock(config),
      marketplacesBlock: renderMarketplacesBlock(config),
      pluginLoopBlock: renderPluginLoopBlock(config),
      mcpsBlock: renderMcpsBlock(config),
      marker: config.marker,
    },
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.overrideCompose.output,
    overrideCompose,
  );
}
