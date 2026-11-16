import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

interface AgentBrowserCommand {
  file: string;
  prefixArgs: string[];
}

let cachedCommand: AgentBrowserCommand | undefined;

/**
 * Resolves how to launch agent-browser on the current platform.
 *
 * The package's JS launcher is run with the current Node binary instead of the
 * `node_modules/.bin` shim: Node refuses to spawn `.cmd` shims on Windows
 * without a shell, and the shim is only on PATH inside `npm run`.
 * Set AGENT_BROWSER_BIN to use a different agent-browser executable.
 */
export function resolveAgentBrowserCommand(): AgentBrowserCommand {
  if (cachedCommand) return cachedCommand;

  const override = process.env.AGENT_BROWSER_BIN?.trim();
  if (override) {
    cachedCommand = /\.(c|m)?js$/i.test(override)
      ? { file: process.execPath, prefixArgs: [override] }
      : { file: override, prefixArgs: [] };
    return cachedCommand;
  }

  const packageJsonPath = require.resolve("agent-browser/package.json");
  const launcher = path.join(path.dirname(packageJsonPath), "bin", "agent-browser.js");
  cachedCommand = { file: process.execPath, prefixArgs: [launcher] };
  return cachedCommand;
}

export async function runAgentBrowser(args: string[], timeout = 45000): Promise<string> {
  try {
    const { file, prefixArgs } = resolveAgentBrowserCommand();
    const { stdout, stderr } = await execFileAsync(
      file,
      [...prefixArgs, ...args],
      {
        timeout,
        maxBuffer: 20 * 1024 * 1024,
        env: process.env,
        windowsHide: true
      }
    );
    return stdout || stderr || "";
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n");
    throw new Error(`agent-browser ${args[0]} failed: ${detail}`);
  }
}
