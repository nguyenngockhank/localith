import { normalizeUrl } from "../../utils.js";
import type { CrawledPage } from "../../types.js";

/**
 * Determines whether a URL path segment appears to be an identifier, token, or dynamic parameter.
 */
export function isIdLikeSegment(segment: string): boolean {
  if (!segment) return false;

  // 0. Email address (e.g. "john.doe@example.com")
  if (/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(segment)) {
    return true;
  }

  // 1. Pure numbers (e.g. "123", "0042")
  if (/^\d+$/.test(segment)) return true;

  // 2. Standard UUID format (e.g. "550e8400-e29b-41d4-a716-446655440000")
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;

  // 3. Hex hash (e.g. git commit hash, sha256, md5, MongoDB ObjectId)
  if (/^[0-9a-f]{16,64}$/i.test(segment) || /^[0-9a-f]{24}$/i.test(segment)) return true;

  // 4. All-uppercase prefixed key (e.g. "ISS-GPDPFI", "JIRA-99", "BUG-ABC")
  if (/^[A-Z]{2,10}-[A-Z0-9]+$/.test(segment)) return true;

  // 5. Slug/prefixed token containing digits (e.g. "issue-123", "usr_42", "post-9823")
  if (/^[a-zA-Z]{2,10}[-_][a-zA-Z0-9]*\d[a-zA-Z0-9]*$/.test(segment)) return true;

  // 6. Slugs with numeric prefix or suffix (e.g. "123-article-title", "article-title-123")
  if (/^\d+-[a-zA-Z0-9-]+$/.test(segment) || /^[a-zA-Z0-9-]+-\d+$/.test(segment)) return true;

  // 7. High-entropy alphanumeric token with mixed letters and digits (e.g. "c7a8b9", "J74ENW")
  if (segment.length >= 6 && segment.length <= 32 && /[0-9]/.test(segment) && /[a-zA-Z]/.test(segment)) {
    return true;
  }

  return false;
}

/**
 * Extracts a normalized pattern template from a URL by replacing dynamic segments with `{{id}}`.
 * For example:
 * `https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-GPDPFI`
 * -> `https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}`
 */
export function extractUrlPattern(urlStr: string): string {
  try {
    const normalized = normalizeUrl(urlStr) ?? urlStr;
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);

    const patternSegments = segments.map((seg) => {
      if (isIdLikeSegment(seg)) {
        return "{{id}}";
      }
      return seg;
    });

    const newPath = "/" + patternSegments.join("/");

    // Handle parameterized query parameters: ?id=123 -> ?id={{id}}
    const params = new URLSearchParams(url.search);
    const patternParams = new URLSearchParams();
    for (const [key, val] of params.entries()) {
      if (isIdLikeSegment(val) || /^(id|uuid|key|code|page|offset)$/i.test(key)) {
        patternParams.set(key, "{{id}}");
      } else {
        patternParams.set(key, val);
      }
    }
    patternParams.sort();
    const search = patternParams.toString() ? `?${patternParams.toString()}` : "";
    return `${url.origin}${newPath}${search}`;
  } catch {
    return urlStr;
  }
}

/**
 * Checks if an extracted pattern has at least one dynamic `{{id}}` placeholder.
 */
export function isDynamicPattern(pattern: string): boolean {
  return pattern.includes("{{id}}");
}

/**
 * Aggregates pattern groups summary from crawled and skipped pages.
 */
export function computePatternGroups(
  pages: readonly CrawledPage[]
): Record<string, { crawled: number; skipped: number }> {
  const groups: Record<string, { crawled: number; skipped: number }> = {};

  for (const page of pages) {
    if (!page.pattern) continue;
    if (!groups[page.pattern]) {
      groups[page.pattern] = { crawled: 0, skipped: 0 };
    }
    if (page.status === "ok") {
      groups[page.pattern].crawled += 1;
    } else if (page.status === "skipped" && page.error?.includes("Pattern")) {
      groups[page.pattern].skipped += 1;
    }
  }

  return groups;
}

/**
 * Registry to track and enforce pattern-based sampling limits.
 */
export class UrlPatternRegistry {
  private patternCounts: Map<string, number> = new Map();
  private maxPerPattern: number;

  constructor(maxPerPattern: number = 3) {
    this.maxPerPattern = maxPerPattern;
  }

  getPattern(url: string): string {
    return extractUrlPattern(url);
  }

  /**
   * Only applies pattern limit check when depth > 1 and the pattern contains dynamic parameters.
   */
  isPatternLimitReached(url: string, depth: number): boolean {
    if (depth <= 1) return false;
    const pattern = this.getPattern(url);
    if (!isDynamicPattern(pattern)) return false;
    const count = this.patternCounts.get(pattern) ?? 0;
    return count >= this.maxPerPattern;
  }

  /**
   * Records a successfully crawled page into the pattern registry.
   */
  recordCrawled(url: string, depth: number): string {
    const pattern = this.getPattern(url);
    if (depth > 1 && isDynamicPattern(pattern)) {
      const count = this.patternCounts.get(pattern) ?? 0;
      this.patternCounts.set(pattern, count + 1);
    }
    return pattern;
  }

  getCount(pattern: string): number {
    return this.patternCounts.get(pattern) ?? 0;
  }

  getAllCounts(): Map<string, number> {
    return new Map(this.patternCounts);
  }
}

