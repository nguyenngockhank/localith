import type { PageExtraction } from "../types.js";
import { runAgentBrowser } from "./runAgentBrowser.js";

export type PageCapture = {
  finalUrl: string;
  snapshot: string;
  extraction: PageExtraction;
}

export async function capturePage(maxSnapshotChars: number, maxTextChars: number, screenshotPath?: string): Promise<PageCapture> {
  // Keep CLI calls sequential: they share one agent-browser session/daemon.
  const urlOutput = await runAgentBrowser(["get", "url"]);
  const snapshotOutput = await runAgentBrowser(["snapshot", "-c"], 60000);

  if (screenshotPath) {
    await runAgentBrowser([
      "screenshot",
      screenshotPath
    ], 30000);
  }

  const evalOutput = await runAgentBrowser([
    "eval",
    `JSON.stringify((() => {
      const clean = (s) => (s || "").replace(/\\s+/g, " ").trim();
      return {
        title: document.title || "",
        description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        canonical: document.querySelector('link[rel="canonical"]')?.href || "",
        headings: Array.from(document.querySelectorAll("h1,h2,h3"))
          .slice(0, 100)
          .map((el) => ({ tag: el.tagName.toLowerCase(), text: clean(el.innerText || el.textContent) }))
          .filter((item) => item.text),
        links: Array.from(document.querySelectorAll("a[href]"))
          .map((a) => ({ href: a.href, text: clean(a.innerText || a.getAttribute("aria-label") || a.title) }))
          .filter((item) => item.href)
          .slice(0, 1500),
        text: (document.body?.innerText || "").slice(0, ${maxTextChars}),
        passwordFields: document.querySelectorAll('input[type="password"]').length
      };
    })())`
  ], 60000);

  const extraction = parseJsonFromCli<PageExtraction>(evalOutput);
  return {
    finalUrl: urlOutput.trim(),
    snapshot: snapshotOutput.slice(0, maxSnapshotChars),
    extraction
  };
}



export function parseJsonFromCli<T>(output: string): T {
  const trimmed = output.trim();
  try {
    const first = JSON.parse(trimmed) as unknown;
    if (typeof first === "string") return JSON.parse(first) as T;
    return first as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new Error(`Could not parse JSON returned by agent-browser: ${trimmed.slice(0, 500)}`);
  }
}


