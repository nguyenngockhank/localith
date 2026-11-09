import type { CrawledPage } from "../../types.js";

/**
 * Creates a CrawledPage entry for a page skipped because its pattern sample cap was reached.
 */
export function createPatternSkippedPage(
  url: string,
  depth: number,
  pattern: string,
  crawledAt: string
): CrawledPage {
  return {
    url,
    finalUrl: url,
    depth,
    status: "skipped",
    error: `Pattern limit reached for ${pattern}`,
    pattern,
    crawledAt
  };
}

