import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BIN = process.platform === "win32" ? "agent-browser.cmd" : "agent-browser";

export async function runAgentBrowser(args: string[], timeout = 45000): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(
      BIN,
      args,
      {
        timeout,
        maxBuffer: 20 * 1024 * 1024,
        env: process.env
      }
    );
    return stdout || stderr || "";
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n");
    throw new Error(`agent-browser ${args[0]} failed: ${detail}`);
  }
}
