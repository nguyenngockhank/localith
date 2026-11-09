import { runAgentBrowser } from "./runAgentBrowser.js";


export async function closeBrowser(): Promise<void> {
    try {
        await runAgentBrowser(["close"], 15000);
    } catch {
        // Best-effort cleanup; preserve the original crawl result/error.
    }
}
