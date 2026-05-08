import {
  assertDockerAvailable,
  composeBuild,
  composeRun,
} from "../docker.js";
import { log } from "../log.js";
import { findVibeSandboxDir, VIBE_SANDBOX_DIR } from "../paths.js";

export async function up(): Promise<void> {
  const cwd = process.cwd();
  const vibeDir = findVibeSandboxDir(cwd);
  if (!vibeDir) {
    throw new Error(
      `No ${VIBE_SANDBOX_DIR}/ found in current directory. Run 'vibe-sandbox init' first or cd into the project root.`,
    );
  }

  await assertDockerAvailable();
  log("Building images...");
  await composeBuild(vibeDir);
  log("Starting Claude REPL...");
  await composeRun(vibeDir);
}
