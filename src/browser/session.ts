import fs from "node:fs";
import { runAgentBrowser } from "./runAgentBrowser.js";
import { openPage } from "./openPage.js";

/**
 * Configure the agent-browser session name and auto-restore flags.
 */
export function setBrowserSession(sessionName: string): void {
  process.env.AGENT_BROWSER_SESSION = sessionName;
  process.env.AGENT_BROWSER_RESTORE = "1";
}

/**
 * Persists the current browser session state (cookies, localStorage, sessionStorage) to a file.
 */
export async function saveBrowserState(statePath: string): Promise<boolean> {
  try {
    await runAgentBrowser(["state", "save", statePath], 30000);
    return true;
  } catch (err) {
    console.warn(`   ⚠️ Could not save browser state: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Restores browser state from a saved state file.
 */
export async function loadBrowserState(statePath: string): Promise<boolean> {
  try {
    await runAgentBrowser(["state", "load", statePath], 30000);
    return true;
  } catch (err) {
    console.warn(`   ⚠️ Could not load browser state: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Sets the browser session and restores saved state into the browser daemon if the state file exists.
 */
export async function restoreBrowserSession(
  sessionName: string,
  statePath?: string
): Promise<boolean> {
  setBrowserSession(sessionName);

  if (statePath && fs.existsSync(statePath)) {
    try {
      // Start daemon session with about:blank, then load state into this session
      await openPage("about:blank", 15000);
      return await loadBrowserState(statePath);
    } catch (err) {
      console.warn(`   ⚠️ Could not restore browser session: ${(err as Error).message}`);
      return false;
    }
  }

  return false;
}

