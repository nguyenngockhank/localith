import { runAgentBrowser } from "./runAgentBrowser.js";


export async function openPage(url: string, timeoutMs = 60000): Promise<void> {
    await runAgentBrowser(["open", url], timeoutMs);
}
