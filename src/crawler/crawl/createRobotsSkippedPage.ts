import type { CrawledPage } from "../../types.js";

/**
 * Creates a CrawledPage entry for a page blocked by robots.txt.
 */

export function createRobotsSkippedPage(
    url: string,
    depth: number,
    crawledAt: string
): CrawledPage {
    return {
        url,
        finalUrl: url,
        depth,
        status: "skipped",
        error: "Disallowed by robots.txt",
        crawledAt
    };
}
