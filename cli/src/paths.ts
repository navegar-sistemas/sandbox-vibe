import { statSync } from "node:fs";
import { join, resolve } from "node:path";

export const VIBE_SANDBOX_DIR = ".vibe-sandbox";

export function findVibeSandboxDir(cwd: string = process.cwd()): string | null {
  const candidate = resolve(cwd, VIBE_SANDBOX_DIR);
  try {
    if (statSync(candidate).isDirectory()) return candidate;
  } catch {
    // ENOENT or any other stat failure: treat as "not found".
  }
  return null;
}

export function vibeSandboxPath(cwd: string, ...parts: string[]): string {
  return join(cwd, VIBE_SANDBOX_DIR, ...parts);
}
