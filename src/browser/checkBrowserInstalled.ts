import { runAgentBrowser } from "./runAgentBrowser.js";


export async function checkBrowserInstalled(): Promise<void> {
    await runAgentBrowser(["--help"], 15000);
}
