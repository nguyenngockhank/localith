import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CrawlOptions, CrawlReport, CrawledPage } from "../../types.js";
import { extractInScopeUrls } from "./extractInScopeUrls.js";
import type { QueueItem } from "./crawler.js";

export interface SavedCrawlData {
  report?: CrawlReport | null;
  queue?: QueueItem[] | null;
}

export interface CrawlState {
  queue: QueueItem[];
  queued: Set<string>;
  visited: Set<string>;
  pages: CrawledPage[];
  pageNumber: number;
  skippedByRobots: number;
  skippedByAuth: number;
  skippedByPattern: number;
  startedAt: string;
  isResumed: boolean;
}

/**
 * Reads report.json and queue.json from an existing run directory, if present.
 */
export async function loadSavedCrawlData(runDir: string): Promise<SavedCrawlData> {
  const reportPath = path.join(runDir, "report.json");
  const queuePath = path.join(runDir, "queue.json");
  let report: CrawlReport | null = null;
  let queue: QueueItem[] | null = null;

  if (fs.existsSync(reportPath)) {
    try {
      const raw = await readFile(reportPath, "utf8");
      report = JSON.parse(raw) as CrawlReport;
    } catch {
      report = null;
    }
  }

  if (fs.existsSync(queuePath)) {
    try {
      const raw = await readFile(queuePath, "utf8");
      queue = JSON.parse(raw) as QueueItem[];
    } catch {
      queue = null;
    }
  }

  return { report, queue };
}

/**
 * Initializes or resumes the crawl state.
 * If previous crawl data exists for this run directory, already crawled pages are preserved
 * and uncrawled URLs are queued to continue the run.
 */
export function initCrawlState(
  options: CrawlOptions,
  saved?: SavedCrawlData
): CrawlState {
  if (!saved?.report) {
    return {
      queue: [{ url: options.startUrl, depth: 0 }],
      queued: new Set<string>([options.startUrl]),
      visited: new Set<string>(),
      pages: [],
      pageNumber: 0,
      skippedByRobots: 0,
      skippedByAuth: 0,
      skippedByPattern: 0,
      startedAt: new Date().toISOString(),
      isResumed: false
    };
  }

  const pages = [...(saved.report.pages ?? [])];
  const visited = new Set<string>();
  for (const page of pages) {
    if (page.url) visited.add(page.url);
    if (page.finalUrl) visited.add(page.finalUrl);
  }

  const queue: QueueItem[] = [];
  const queued = new Set<string>(visited);

  if (saved.queue && Array.isArray(saved.queue) && saved.queue.length > 0) {
    for (const item of saved.queue) {
      if (!visited.has(item.url) && !queued.has(item.url)) {
        queue.push(item);
        queued.add(item.url);
      }
    }
  } else {
    // Reconstruct pending queue from links on crawled pages
    const startUrlObj = new URL(options.startUrl);
    for (const page of pages) {
      if (page.depth < options.maxDepth && page.links && page.status === "ok") {
        const inScopeUrls = extractInScopeUrls(
          page.links,
          page.finalUrl || page.url,
          startUrlObj,
          options.includeSubdomains
        );
        for (const url of inScopeUrls) {
          if (!visited.has(url) && !queued.has(url)) {
            queue.push({ url, depth: page.depth + 1 });
            queued.add(url);
          }
        }
      }
    }
  }

  // Ensure startUrl is queued if it was never visited
  if (!visited.has(options.startUrl) && !queued.has(options.startUrl)) {
    queue.unshift({ url: options.startUrl, depth: 0 });
    queued.add(options.startUrl);
  }

  const skippedByRobots =
    saved.report.totals?.skippedByRobots ??
    pages.filter((p) => p.status === "skipped" && p.error?.includes("robots")).length;

  const skippedByAuth =
    saved.report.totals?.skippedByAuth ??
    pages.filter((p) => p.authWall && p.status === "skipped").length;

  const skippedByPattern =
    saved.report.totals?.skippedByPattern ??
    pages.filter((p) => p.status === "skipped" && p.error?.includes("Pattern")).length;

  return {
    queue,
    queued,
    visited,
    pages,
    pageNumber: pages.length,
    skippedByRobots,
    skippedByAuth,
    skippedByPattern,
    startedAt: saved.report.startedAt || new Date().toISOString(),
    isResumed: true
  };
}
