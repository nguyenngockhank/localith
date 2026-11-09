import type { ExtractedLink } from "../../types.js";
import { normalizeUrl, isInScope } from "../../utils.js";

/**
 * Normalizes, validates, and filters links to those within the crawl scope, deduplicating within the page.
 */

export function extractInScopeUrls(
    links: readonly ExtractedLink[],
    baseUrl: string,
    startUrl: URL,
    includeSubdomains: boolean
): string[] {
    const seen = new Set<string>();
    const inScopeUrls: string[] = [];

    for (const link of links) {
        const normalized = normalizeUrl(link.href, baseUrl);
        if (!normalized) continue;
        if (!isInScope(normalized, startUrl, includeSubdomains)) continue;
        if (!seen.has(normalized)) {
            seen.add(normalized);
            inScopeUrls.push(normalized);
        }
    }

    return inScopeUrls;
}
