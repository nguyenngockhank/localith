import fs from "node:fs";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import type {
  CrawlOptions,
  CrawlReport,
  CrawledPage,
  ExtractedLink,
  PageExtraction
} from "../../types.js";
import {
  ensureDir,
  normalizeUrl,
  sleep,
  writeJson
} from "../../utils.js";
import { closeBrowser } from "../../browser/closeBrowser.js";
import { openPage } from "../../browser/openPage.js";
import { capturePage } from "../../browser/capturePage.js";
import { loadRobotsPolicy } from "../../robots.js";
import { saveBrowserState, restoreBrowserSession } from "../../browser/session.js";
import { detectAuthWall } from "../detectAuthWall.js";
import { createRunDirectory, safeSlug } from "../createRunDirectory.js";
import { buildMarkdownReport } from "../buildMarkdownReport.js";
import { createErrorPage } from "./createErrorPage.js";
import { createSuccessPage } from "./createSuccessPage.js";
import { extractInScopeUrls } from "./extractInScopeUrls.js";
import { handleAuthWall } from "./handleAuthWall.js";
import { buildCrawlReport } from "./buildCrawlReport.js";
import { createAuthSkippedPage } from "./createAuthSkippedPage.js";
import { createRobotsSkippedPage } from "./createRobotsSkippedPage.js";
import { createPatternSkippedPage } from "./createPatternSkippedPage.js";
import { loadSavedCrawlData, initCrawlState } from "./initCrawlState.js";
import { UrlPatternRegistry, extractUrlPattern, isDynamicPattern } from "./urlPattern.js";
import { generateCrawlKnowledge } from "../../knowledge/generateScreenKnowledge.js";

export interface QueueItem {
  url: string;
  depth: number;
  pattern?: string;
}

export interface PageArtifactPaths {
  snapshotPath: string;
  dataPath: string;
  screenshotPath: string;
}

export interface CreateSuccessPageParams {
  url: string;
  finalUrl: string;
  depth: number;
  extraction: PageExtraction;
  runDir: string;
  snapshotPath: string;
  dataPath: string;
  authWall: boolean;
  authHandled: boolean;
  pattern?: string;
  crawledAt: string;
}

export interface BuildCrawlReportParams {
  options: CrawlOptions;
  pages: CrawledPage[];
  startedAt: string;
  finishedAt: string;
  effectiveDelay: number;
  discoveredCount: number;
  visitedCount: number;
  skippedByRobots: number;
  skippedByAuth: number;
  skippedByPattern: number;
}

export interface AuthResolutionResult {
  success: boolean;
  authHandled: boolean;
  extraction: PageExtraction;
  finalUrl: string;
  snapshot: string;
}

// ---------------------------------------------------------------------------
// Main Crawl Orchestrator
// ---------------------------------------------------------------------------

export async function crawl(options: CrawlOptions): Promise<CrawlReport> {
  const start = new URL(options.startUrl);
  const runDir = createRunDirectory(options.startUrl);
  const pagesDir = path.join(runDir, "pages");
  await ensureDir(pagesDir);

  const sessionSlug = safeSlug(options.startUrl);
  const authStatePath = path.join(runDir, "auth-state.json");
  const queuePath = path.join(runDir, "queue.json");
  const reportPath = path.join(runDir, "report.json");

  // Load existing crawl state if this input link was already scanned
  const savedData = await loadSavedCrawlData(runDir);
  const state = initCrawlState(options, savedData);

  const robots = options.respectRobots
    ? await loadRobotsPolicy(options.startUrl)
    : { isAllowed: () => true, crawlDelayMs: 0 };

  const effectiveDelay = Math.max(options.delayMs, robots.crawlDelayMs);
  const queue = state.queue;
  const queued = state.queued;
  const visited = state.visited;
  const pages = state.pages;
  let skippedByRobots = state.skippedByRobots;
  let skippedByAuth = state.skippedByAuth;
  let skippedByPattern = state.skippedByPattern;
  let pageNumber = state.pageNumber;
  let lastRequestAt = 0;

  // Initialize URL Pattern Registry with configured sample limit (default 3)
  const maxPerPattern = options.maxPagesPerPattern ?? 3;
  const patternRegistry = new UrlPatternRegistry(maxPerPattern);

  // Re-hydrate pattern counts from previously crawled pages
  for (const page of pages) {
    if (page.status === "ok" && page.depth > 1) {
      patternRegistry.recordCrawled(page.url, page.depth);
    }
  }

  // Initialize browser session & restore previous auth state if available
  const sessionRestored = await restoreBrowserSession(sessionSlug, authStatePath);

  const actualCrawledPagesCount = pages.filter((p) => p.status === "ok").length;

  console.log(`\n🔎 Local Website Scanner${state.isResumed ? " (Resuming Scan)" : ""}`);
  console.log(`   Start: ${options.startUrl}`);
  if (state.isResumed) {
    console.log(`   Resuming: ${actualCrawledPagesCount} previously crawled pages | Pending queue: ${queue.length} URLs`);
  }
  console.log(`   Depth limit: ${options.maxDepth} | Target max pages: ${options.maxPages} (Remaining: ${Math.max(0, options.maxPages - actualCrawledPagesCount)})`);
  console.log(`   Pattern sampling: max ${maxPerPattern} pages per dynamic pattern group at depth > 1`);
  console.log(`   AI: ${options.useAi ? options.ollamaModel : "disabled"}`);
  console.log(`   robots.txt: ${options.respectRobots ? "respected" : "ignored"}`);
  console.log(`   Auth wall handling: ${options.auth.enabled ? "enabled" : "disabled"}`);
  if (sessionRestored) {
    console.log(`   Session: Restored saved authentication state (${path.basename(authStatePath)})`);
  }
  console.log(`   Output: ${runDir}\n`);

  if (actualCrawledPagesCount >= options.maxPages) {
    console.log(`ℹ️ Already reached limit of ${options.maxPages} pages (${actualCrawledPagesCount} successful crawls recorded).`);
    if (queue.length > 0) {
      console.log(`   There are ${queue.length} pending uncrawled URLs in the queue.`);
      console.log(`   To crawl more pages, re-run with a higher --max-pages value.\n`);
    }
  }

  try {
    while (queue.length > 0 && pages.filter((p) => p.status === "ok").length < options.maxPages) {
      const item = queue.shift()!;
      if (visited.has(item.url)) continue;
      visited.add(item.url);

      // 1. Robots.txt policy check
      if (!robots.isAllowed(item.url)) {
        skippedByRobots += 1;
        pages.push(createRobotsSkippedPage(item.url, item.depth, new Date().toISOString()));
        console.log(`⏭  [robots] ${item.url}`);
        continue;
      }

      // 2. Dynamic pattern limit check for depth > 1
      if (item.depth > 1 && patternRegistry.isPatternLimitReached(item.url, item.depth)) {
        const pattern = patternRegistry.getPattern(item.url);
        skippedByPattern += 1;
        pages.push(createPatternSkippedPage(item.url, item.depth, pattern, new Date().toISOString()));
        console.log(`⏭  [pattern cap] ${item.url} -> ${pattern}`);
        continue;
      }

      const waitFor = calculateWaitTime(effectiveDelay, lastRequestAt, Date.now());
      if (waitFor > 0) await sleep(waitFor);

      pageNumber += 1;
      const pageStarted = Date.now();
      const currentCrawled = pages.filter((p) => p.status === "ok").length + 1;
      console.log(`🌐 [${currentCrawled}/${options.maxPages}] depth=${item.depth} ${item.url}`);

      const pagePrefix = getPagePrefix(pageNumber);
      const { snapshotPath, dataPath, screenshotPath } = getPageArtifactPaths(pagesDir, pagePrefix);

      try {
        await openPage(item.url, options.pageTimeoutMs);
        lastRequestAt = Date.now();

        // Allow client-rendered content to settle before reading the DOM.
        await sleep(5000);

        const captured = await capturePage(
          options.maxSnapshotChars,
          options.maxPageTextChars,
          options.screenshot ? screenshotPath : undefined
        );

        let finalUrl = normalizeUrl(captured.finalUrl) ?? item.url;
        let extraction: PageExtraction = captured.extraction;
        let snapshot = captured.snapshot;

        let authWall = false;
        let authHandled = false;

        if (detectAuthWall(extraction, finalUrl)) {
          authWall = true;
          if (!options.auth.enabled) {
            skippedByAuth += 1;
            pages.push(
              createAuthSkippedPage(
                item.url,
                finalUrl,
                item.depth,
                "Auth wall detected (re-run with --auth and AUTH_EMAIL/AUTH_PASSWORD to proceed)",
                false,
                new Date().toISOString()
              )
            );
            console.log(`🔐 [auth wall] ${item.url}`);
            continue;
          }

          const authResult = await handleAuthWall(options, extraction, finalUrl, snapshot);
          authHandled = authResult.authHandled;

          if (!authResult.success) {
            skippedByAuth += 1;
            pages.push(
              createAuthSkippedPage(
                item.url,
                authResult.finalUrl,
                item.depth,
                "Auth wall: sign-in did not succeed",
                authHandled,
                new Date().toISOString()
              )
            );
            console.log(`   ✗ Sign-in did not succeed`);
            continue;
          }

          extraction = authResult.extraction;
          finalUrl = authResult.finalUrl;
          snapshot = authResult.snapshot;
          console.log("   ✓ Sign-in completed, continuing crawl");

          // Save auth state immediately upon successful login
          await saveBrowserState(authStatePath);
          console.log(`   💾 Saved session state to ${path.basename(authStatePath)}`);
        }

        await writeFile(snapshotPath, snapshot, "utf8");

        const pattern = patternRegistry.getPattern(item.url);
        if (item.depth > 1 && isDynamicPattern(pattern)) {
          patternRegistry.recordCrawled(item.url, item.depth);
        }

        const record = createSuccessPage({
          url: item.url,
          finalUrl,
          depth: item.depth,
          pattern: isDynamicPattern(pattern) ? pattern : undefined,
          extraction,
          runDir,
          snapshotPath,
          dataPath,
          authWall,
          authHandled,
          crawledAt: new Date().toISOString()
        });

        await writeJson(dataPath, { ...record, snapshot });
        pages.push(record);

        if (item.depth < options.maxDepth) {
          const nextItems = getNextQueueItems(
            extraction.links,
            finalUrl,
            start,
            options.includeSubdomains,
            item.depth,
            (url) => queued.has(url) || visited.has(url)
          );
          for (const next of nextItems) {
            queued.add(next.url);
            queue.push(next);
          }
        }

        // Persist queue after each successfully discovered page
        await writeJson(queuePath, queue);

        console.log(
          `   ✓ ${extraction.title || "(no title)"} | ${extraction.links.length} links | ${formatDuration(Date.now() - pageStarted)}`
        );
      } catch (error) {
        const message = (error as Error).message;
        pages.push(createErrorPage(item.url, item.depth, message, new Date().toISOString()));
        console.log(`   ✗ ${message.slice(0, 300)}`);
      }
    }
  } finally {
    // Save browser state before closing
    try {
      if (options.auth.enabled || fs.existsSync(authStatePath)) {
        await saveBrowserState(authStatePath);
      }
    } catch {
      // Best-effort
    }
    await closeBrowser();
  }

  const finishedAt = new Date();
  const report = buildCrawlReport({
    options,
    pages,
    startedAt: state.startedAt,
    finishedAt: finishedAt.toISOString(),
    effectiveDelay,
    discoveredCount: queued.size,
    visitedCount: visited.size,
    skippedByRobots,
    skippedByAuth,
    skippedByPattern
  });

  await writeJson(reportPath, report);
  await writeFile(path.join(runDir, "report.md"), buildMarkdownReport(report, runDir), "utf8");
  await writeJson(queuePath, queue);

  console.log("\n✅ Scan finished");
  console.log(`   Visited: ${report.totals.visited}`);
  console.log(`   Successful: ${report.totals.succeeded} | Failed: ${report.totals.failed} | Robots skipped: ${report.totals.skippedByRobots} | Auth walls: ${report.totals.skippedByAuth} | Pattern skipped: ${report.totals.skippedByPattern ?? 0}`);
  console.log(`   Discovered: ${report.totals.discovered}`);
  if (report.patternGroups && Object.keys(report.patternGroups).length > 0) {
    console.log(`   Pattern groups: ${Object.keys(report.patternGroups).length}`);
  }
  if (queue.length > 0) {
    console.log(`   Pending in queue: ${queue.length} not-crawled URLs`);
  }
  console.log(`   Duration: ${formatDuration(finishedAt.getTime() - new Date(state.startedAt).getTime())}`);
  console.log(`   Report: ${path.join(runDir, "report.md")}\n`);

  if (options.generateKnowledge) {
    console.log("🧠 Generating screen & pattern knowledge with Ollama...");
    try {
      await generateCrawlKnowledge({
        runDir,
        report,
        ollamaUrl: options.ollamaUrl,
        ollamaModel: options.ollamaModel
      });
      console.log(`   ✓ Knowledge report: ${path.join(runDir, "knowledge.md")}\n`);
    } catch (err) {
      console.warn(`   ⚠️ Knowledge generation failed: ${(err as Error).message}\n`);
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Calculates how many milliseconds to wait before the next request.
 */
export function calculateWaitTime(
  effectiveDelay: number,
  lastRequestAt: number,
  now: number
): number {
  if (lastRequestAt <= 0) return 0;
  return Math.max(0, effectiveDelay - (now - lastRequestAt));
}

/**
 * Generates the standard file prefix for a numbered page.
 */
export function getPagePrefix(pageNumber: number): string {
  return `page-${String(pageNumber).padStart(4, "0")}`;
}

/**
 * Resolves artifact file paths for a page given the pages directory and prefix.
 */
export function getPageArtifactPaths(
  pagesDir: string,
  pagePrefix: string
): PageArtifactPaths {
  return {
    snapshotPath: path.join(pagesDir, `${pagePrefix}.snapshot.txt`),
    dataPath: path.join(pagesDir, `${pagePrefix}.json`),
    screenshotPath: path.join(pagesDir, `${pagePrefix}.png`)
  };
}

/**
 * Determines the next queue items to crawl given extracted links and a predicate checking if a URL is already known.
 */
export function getNextQueueItems(
  links: readonly ExtractedLink[],
  baseUrl: string,
  startUrl: URL,
  includeSubdomains: boolean,
  currentDepth: number,
  isKnown: (url: string) => boolean
): QueueItem[] {
  const inScopeUrls = extractInScopeUrls(links, baseUrl, startUrl, includeSubdomains);
  return inScopeUrls
    .filter((url) => !isKnown(url))
    .map((url) => ({
      url,
      depth: currentDepth + 1,
      pattern: extractUrlPattern(url)
    }));
}

/**
 * Computes crawl totals from page records and crawl counters.
 */
export function computeCrawlTotals(
  pages: readonly CrawledPage[],
  discoveredCount: number,
  visitedCount: number,
  skippedByRobots: number,
  skippedByAuth: number,
  skippedByPattern: number
): CrawlReport["totals"] {
  let succeeded = 0;
  let failed = 0;

  for (const page of pages) {
    if (page.status === "ok") succeeded += 1;
    else if (page.status === "error") failed += 1;
  }

  return {
    discovered: discoveredCount,
    visited: visitedCount,
    succeeded,
    failed,
    skippedByRobots,
    skippedByAuth,
    skippedByPattern
  };
}

export function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 300);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
