import test from "node:test";
import assert from "node:assert/strict";
import {
  isIdLikeSegment,
  extractUrlPattern,
  isDynamicPattern,
  UrlPatternRegistry,
  computePatternGroups
} from "../src/crawler/crawl/urlPattern.js";
import type { CrawledPage } from "../src/types.js";

test("isIdLikeSegment identifies issue keys, numbers, and UUIDs while preserving static slugs", () => {
  // Dynamic IDs & Keys
  assert.equal(isIdLikeSegment("ISS-GPDPFI"), true);
  assert.equal(isIdLikeSegment("ISS-J74ENW"), true);
  assert.equal(isIdLikeSegment("ISS-FOTF0M"), true);
  assert.equal(isIdLikeSegment("ISS-HJEG0K"), true);
  assert.equal(isIdLikeSegment("ISS-XFB21G"), true);
  assert.equal(isIdLikeSegment("12345"), true);
  assert.equal(isIdLikeSegment("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isIdLikeSegment("507f1f77bcf86cd799439011"), true);
  assert.equal(isIdLikeSegment("issue-123"), true);
  assert.equal(isIdLikeSegment("ticket_9824"), true);
  assert.equal(isIdLikeSegment("c7a8b9"), true);

  // Static words & multi-word slugs (must NOT be treated as IDs)
  assert.equal(isIdLikeSegment("report-issues"), false);
  assert.equal(isIdLikeSegment("contact-us"), false);
  assert.equal(isIdLikeSegment("about-company"), false);
  assert.equal(isIdLikeSegment("dashboard"), false);
  assert.equal(isIdLikeSegment("settings"), false);
  assert.equal(isIdLikeSegment("users"), false);
});

test("extractUrlPattern abstracts dynamic segments into {{id}}", () => {
  const url1 = "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-GPDPFI";
  const url2 = "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-J74ENW";
  const urlStatic = "https://admin.dev.frf.app.fanzeal.com/report-issues";

  const pattern1 = extractUrlPattern(url1);
  const pattern2 = extractUrlPattern(url2);
  const patternStatic = extractUrlPattern(urlStatic);

  assert.equal(pattern1, "https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}");
  assert.equal(pattern2, "https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}");
  assert.equal(pattern1, pattern2);

  assert.equal(patternStatic, "https://admin.dev.frf.app.fanzeal.com/report-issues");
  assert.equal(isDynamicPattern(pattern1), true);
  assert.equal(isDynamicPattern(patternStatic), false);
});

test("UrlPatternRegistry enforces sample limit of 3 only at depth > 1", () => {
  const registry = new UrlPatternRegistry(3);

  const urls = [
    "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-GPDPFI",
    "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-J74ENW",
    "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-FOTF0M",
    "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-HJEG0K",
    "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-XFB21G"
  ];

  // At depth 1, limit check is never reached
  assert.equal(registry.isPatternLimitReached(urls[0]!, 1), false);

  // At depth 2:
  // Item 1: count is 0 -> false
  assert.equal(registry.isPatternLimitReached(urls[0]!, 2), false);
  registry.recordCrawled(urls[0]!, 2);

  // Item 2: count is 1 -> false
  assert.equal(registry.isPatternLimitReached(urls[1]!, 2), false);
  registry.recordCrawled(urls[1]!, 2);

  // Item 3: count is 2 -> false
  assert.equal(registry.isPatternLimitReached(urls[2]!, 2), false);
  registry.recordCrawled(urls[2]!, 2);

  // Item 4: count is 3 -> limit reached! true
  assert.equal(registry.isPatternLimitReached(urls[3]!, 2), true);

  // Item 5: count is 3 -> limit reached! true
  assert.equal(registry.isPatternLimitReached(urls[4]!, 2), true);

  // A different pattern is not affected
  const otherUrl = "https://admin.dev.frf.app.fanzeal.com/users/USR-001";
  assert.equal(registry.isPatternLimitReached(otherUrl, 2), false);
});

test("computePatternGroups aggregates crawled and skipped counts per pattern", () => {
  const pattern = "https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}";
  const pages: CrawledPage[] = [
    { url: "u1", finalUrl: "u1", depth: 2, status: "ok", pattern, crawledAt: "" },
    { url: "u2", finalUrl: "u2", depth: 2, status: "ok", pattern, crawledAt: "" },
    { url: "u3", finalUrl: "u3", depth: 2, status: "ok", pattern, crawledAt: "" },
    { url: "u4", finalUrl: "u4", depth: 2, status: "skipped", error: "Pattern limit reached", pattern, crawledAt: "" },
    { url: "u5", finalUrl: "u5", depth: 2, status: "skipped", error: "Pattern limit reached", pattern, crawledAt: "" }
  ];

  const groups = computePatternGroups(pages);
  assert.deepEqual(groups[pattern], { crawled: 3, skipped: 2 });
});

