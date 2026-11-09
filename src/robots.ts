import robotsParser from "robots-parser";

interface RobotsParserApi {
  getCrawlDelay(agent: string): number | null;
  isAllowed(url: string, agent: string): boolean | null;
}

interface RobotsParserInstance {
  (url: string, text: string): RobotsParserApi;
  getCrawlDelay(agent: string): number | null;
  isAllowed(url: string, agent: string): boolean | null;
}

export interface RobotsPolicy {
  isAllowed(url: string): boolean;
  crawlDelayMs: number;
}

export async function loadRobotsPolicy(startUrl: string): Promise<RobotsPolicy> {
  const origin = new URL(startUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": "LocalWebsiteScanner/1.0 (+local website audit)" },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return { isAllowed: () => true, crawlDelayMs: 0 };
    }

    const text = await response.text();
    const robots = (robotsParser as unknown) as RobotsParserInstance;
    const parsed = robots(robotsUrl, text);
    const delaySeconds = parsed.getCrawlDelay("LocalWebsiteScanner") ??
      parsed.getCrawlDelay("*") ?? 0;

    return {
      isAllowed: (url) => parsed.isAllowed(url, "LocalWebsiteScanner") !== false,
      crawlDelayMs: Math.max(0, Number(delaySeconds) * 1000 || 0)
    };
  } catch {
    // If robots.txt cannot be reached, continue with conservative request pacing.
    return { isAllowed: () => true, crawlDelayMs: 0 };
  }
}
