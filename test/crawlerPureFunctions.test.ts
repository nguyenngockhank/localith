import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWaitTime,
  getPagePrefix,
  getPageArtifactPaths,
  getNextQueueItems,
  computeCrawlTotals,
  escapeCell,
  formatDuration
} from "../src/crawler/crawl/crawler.js";
import { extractInScopeUrls } from "../src/crawler/crawl/extractInScopeUrls.js";
import type { CrawledPage, ExtractedLink } from "../src/types.js";

test("calculateWaitTime returns remaining time when interval has not elapsed", () => {
  const effectiveDelay = 1000;
  const lastRequestAt = 5000;
  const now = 5400; // 400ms elapsed, 600ms remaining
  assert.equal(calculateWaitTime(effectiveDelay, lastRequestAt, now), 600);
});

test("calculateWaitTime returns 0 when interval has elapsed or first request", () => {
  assert.equal(calculateWaitTime(1000, 0, 5000), 0);
  assert.equal(calculateWaitTime(1000, 5000, 7000), 0);
});

test("getPagePrefix formats page numbers with 4-digit padding", () => {
  assert.equal(getPagePrefix(1), "page-0001");
  assert.equal(getPagePrefix(42), "page-0042");
  assert.equal(getPagePrefix(9999), "page-9999");
});

test("getPageArtifactPaths generates snapshot, json, and screenshot paths", () => {
  const paths = getPageArtifactPaths("/tmp/reports/pages", "page-0001");
  assert.equal(paths.snapshotPath, "/tmp/reports/pages/page-0001.snapshot.txt");
  assert.equal(paths.dataPath, "/tmp/reports/pages/page-0001.json");
  assert.equal(paths.screenshotPath, "/tmp/reports/pages/page-0001.png");
});

test("extractInScopeUrls normalizes and keeps only in-scope links", () => {
  const baseUrl = "https://example.com/blog";
  const startUrl = new URL("https://example.com");
  const links: ExtractedLink[] = [
    { href: "/post-1", text: "Post 1" },
    { href: "https://example.com/post-2?utm_source=twitter", text: "Post 2" },
    { href: "/post-1", text: "Duplicate Post 1" }, // Duplicate
    { href: "https://other.com/about", text: "External" },
    { href: "javascript:void(0)", text: "JS" }
  ];

  const inScope = extractInScopeUrls(links, baseUrl, startUrl, false);
  assert.deepEqual(inScope, [
    "https://example.com/post-1",
    "https://example.com/post-2"
  ]);
});

test("getNextQueueItems enqueues only unvisited and unqueued items with incremented depth", () => {
  const links: ExtractedLink[] = [
    { href: "/page-a", text: "A" },
    { href: "/page-b", text: "B" }
  ];
  const baseUrl = "https://example.com";
  const startUrl = new URL("https://example.com");
  const visited = new Set(["https://example.com/page-a"]);

  const nextItems = getNextQueueItems(
    links,
    baseUrl,
    startUrl,
    false,
    1, // current depth
    (url) => visited.has(url)
  );

  assert.equal(nextItems.length, 1);
  assert.deepEqual(nextItems[0], {
    url: "https://example.com/page-b",
    depth: 2,
    pattern: "https://example.com/page-b"
  });
});

test("computeCrawlTotals calculates totals from page records correctly", () => {
  const pages: CrawledPage[] = [
    { url: "https://example.com", finalUrl: "https://example.com", depth: 0, status: "ok", crawledAt: "" },
    { url: "https://example.com/bad", finalUrl: "https://example.com/bad", depth: 1, status: "error", crawledAt: "" },
    { url: "https://example.com/disallowed", finalUrl: "https://example.com/disallowed", depth: 1, status: "skipped", crawledAt: "" }
  ];

  const totals = computeCrawlTotals(pages, 10, 3, 1, 0);
  assert.equal(totals.discovered, 10);
  assert.equal(totals.visited, 3);
  assert.equal(totals.succeeded, 1);
  assert.equal(totals.failed, 1);
  assert.equal(totals.skippedByRobots, 1);
  assert.equal(totals.skippedByAuth, 0);
});

test("escapeCell escapes pipes and newlines for markdown tables", () => {
  assert.equal(escapeCell("hello | world"), "hello \\| world");
  assert.equal(escapeCell("line1\nline2"), "line1 line2");
});

test("formatDuration formats milliseconds into human-readable strings", () => {
  assert.equal(formatDuration(500), "500ms");
  assert.equal(formatDuration(1500), "1.5s");
  assert.equal(formatDuration(12345), "12.3s");
});

