import type { CrawledPage } from "../../types.js";

/**
 * Creates a CrawledPage entry for an auth-walled page.
 */

export function createAuthSkippedPage(
    url: string,
    finalUrl: string,
    depth: number,
    error: string,
    authHandled: boolean,
    crawledAt: string
): CrawledPage {
    return {
        url,
        finalUrl,
        depth,
        status: "skipped",
        error,
        authWall: true,
        ...(authHandled ? { authHandled: true } : {}),
        crawledAt
    };
}
