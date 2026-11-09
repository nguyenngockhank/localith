import test from "node:test";
import assert from "node:assert/strict";
import { initCrawlState } from "../src/crawler/crawl/initCrawlState.js";
import { safeSlug, createRunDirectory } from "../src/crawler/createRunDirectory.js";
import type { CrawlOptions, CrawlReport } from "../src/types.js";

const mockOptions: CrawlOptions = {
  startUrl: "https://example.com",
  maxDepth: 3,
  maxPages: 10,
  delayMs: 100,
  pageTimeoutMs: 1000,
  maxSnapshotChars: 5000,
  maxPageTextChars: 5000,
  includeSubdomains: false,
  respectRobots: true,
  auth: { enabled: true, email: "user@example.com", password: "pw" },
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3",
  screenshot: false
};

test("safeSlug produces consistent and valid session identifier", () => {
  const slug1 = safeSlug("https://example.com/foo");
  const slug2 = safeSlug("https://example.com/foo");
  const slug3 = safeSlug("https://example.com/bar");

  assert.equal(slug1, slug2);
  assert.match(slug1, /^[a-z0-9_-]+$/i);
  assert.notEqual(slug1, slug3);
});

test("createRunDirectory uses same directory for identical startUrl", () => {
  const dir1 = createRunDirectory("https://example.com");
  const dir2 = createRunDirectory("https://example.com");
  assert.equal(dir1, dir2);
});

test("initCrawlState initializes fresh state when no previous report exists", () => {
  const state = initCrawlState(mockOptions);

  assert.equal(state.isResumed, false);
  assert.equal(state.pages.length, 0);
  assert.equal(state.pageNumber, 0);
  assert.equal(state.queue.length, 1);
  assert.deepEqual(state.queue[0], { url: "https://example.com", depth: 0 });
  assert.equal(state.visited.size, 0);
});

test("initCrawlState resumes from previous report and reconstructs pending queue", () => {
  const previousReport: CrawlReport = {
    startUrl: "https://example.com",
    startedAt: "2026-11-01T00:00:00.000Z",
    finishedAt: "2026-11-01T00:01:00.000Z",
    settings: {
      maxDepth: 3,
      maxPages: 10,
      delayMs: 100,
      includeSubdomains: false,
      respectRobots: true,
      auth: { enabled: true },
      ollamaModel: "llama3"
    },
    totals: {
      discovered: 3,
      visited: 1,
      succeeded: 1,
      failed: 0,
      skippedByRobots: 0,
      skippedByAuth: 0
    },
    pages: [
      {
        url: "https://example.com",
        finalUrl: "https://example.com",
        depth: 0,
        status: "ok",
        title: "Home",
        links: [
          { href: "https://example.com/about", text: "About" },
          { href: "https://example.com/contact", text: "Contact" },
          { href: "https://external.com/page", text: "External" }
        ],
        crawledAt: "2026-11-01T00:00:30.000Z"
      }
    ]
  };

  const state = initCrawlState(mockOptions, { report: previousReport });

  assert.equal(state.isResumed, true);
  assert.equal(state.pages.length, 1);
  assert.equal(state.pageNumber, 1);
  assert.equal(state.visited.has("https://example.com"), true);

  // Queue should have in-scope unvisited URLs: /about and /contact
  assert.equal(state.queue.length, 2);
  assert.deepEqual(state.queue[0], { url: "https://example.com/about", depth: 1 });
  assert.deepEqual(state.queue[1], { url: "https://example.com/contact", depth: 1 });
});

test("initCrawlState uses saved queue when available, filtering already visited items", () => {
  const previousReport: CrawlReport = {
    startUrl: "https://example.com",
    startedAt: "2026-11-01T00:00:00.000Z",
    finishedAt: "2026-11-01T00:01:00.000Z",
    settings: {
      maxDepth: 3,
      maxPages: 10,
      delayMs: 100,
      includeSubdomains: false,
      respectRobots: true,
      auth: { enabled: true },
      ollamaModel: "llama3"
    },
    totals: {
      discovered: 4,
      visited: 2,
      succeeded: 2,
      failed: 0,
      skippedByRobots: 0,
      skippedByAuth: 0
    },
    pages: [
      {
        url: "https://example.com",
        finalUrl: "https://example.com",
        depth: 0,
        status: "ok",
        crawledAt: "2026-11-01T00:00:10.000Z"
      },
      {
        url: "https://example.com/about",
        finalUrl: "https://example.com/about",
        depth: 1,
        status: "ok",
        crawledAt: "2026-11-01T00:00:20.000Z"
      }
    ]
  };

  const savedQueue = [
    { url: "https://example.com/about", depth: 1 }, // Already visited
    { url: "https://example.com/team", depth: 2 },  // Pending
    { url: "https://example.com/pricing", depth: 1 } // Pending
  ];

  const state = initCrawlState(mockOptions, { report: previousReport, queue: savedQueue });

  assert.equal(state.isResumed, true);
  assert.equal(state.pages.length, 2);
  assert.equal(state.pageNumber, 2);

  // /about is already visited, so only /team and /pricing should be in queue
  assert.equal(state.queue.length, 2);
  assert.deepEqual(state.queue[0], { url: "https://example.com/team", depth: 2 });
  assert.deepEqual(state.queue[1], { url: "https://example.com/pricing", depth: 1 });
});

