import type { CrawledPage } from "../../types.js";

/**
 * Creates a CrawledPage entry for an error encountered during page processing.
 */
export function createErrorPage(
    url: string,
    depth: number,
    errorMessage: string,
    crawledAt: string
): CrawledPage {
    return {
        url,
        finalUrl: url,
        depth,
        status: "error",
        error: errorMessage,
        crawledAt
    };
}
