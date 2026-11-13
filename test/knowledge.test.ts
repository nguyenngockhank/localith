import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  groupPagesForKnowledge,
  loadPageSnapshot,
  generateCrawlKnowledge,
  loadSavedScreenKnowledge
} from "../src/knowledge/generateScreenKnowledge.js";
import { persistScreenKnowledgeState } from "../src/knowledge/persistScreenKnowledgeState.js";
import { buildKnowledgeMarkdown } from "../src/knowledge/buildKnowledgeMarkdown.js";
import { handleRequest } from "../src/server.js";
import type { CrawledPage, CrawlKnowledgeResult } from "../src/types.js";

function createMockReqRes(method: string, url: string, body?: unknown) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };

  let statusCode = 200;
  let headers: Record<string, string> = {};
  let responseData = "";

  const res = {
    writeHead(code: number, hdrs: Record<string, string>) {
      statusCode = code;
      headers = hdrs;
    },
    end(data?: string) {
      if (data) responseData += data;
    }
  } as any;

  process.nextTick(() => {
    if (body !== undefined) {
      req.emit("data", typeof body === "string" ? body : JSON.stringify(body));
    }
    req.emit("end");
  });

  return {
    req,
    res,
    getStatus: () => statusCode,
    getHeaders: () => headers,
    getBody: () => (responseData ? JSON.parse(responseData) : null),
    getRawBody: () => responseData
  };
}

test("groupPagesForKnowledge correctly groups parameterized pages into a single screen group", () => {
  const pages: CrawledPage[] = [
    {
      url: "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-GPDPFI",
      finalUrl: "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-GPDPFI",
      depth: 2,
      status: "ok",
      title: "Issue GPDPFI",
      pattern: "https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}",
      crawledAt: ""
    },
    {
      url: "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-J74ENW",
      finalUrl: "https://admin.dev.frf.app.fanzeal.com/report-issues/ISS-J74ENW",
      depth: 2,
      status: "ok",
      title: "Issue J74ENW",
      pattern: "https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}",
      crawledAt: ""
    },
    {
      url: "https://admin.dev.frf.app.fanzeal.com/dashboard",
      finalUrl: "https://admin.dev.frf.app.fanzeal.com/dashboard",
      depth: 1,
      status: "ok",
      title: "Dashboard",
      crawledAt: ""
    }
  ];

  const groups = groupPagesForKnowledge(pages);
  assert.equal(groups.length, 2);

  const patternGroup = groups.find((g) => g.isPatternGroup);
  assert.ok(patternGroup);
  assert.equal(patternGroup.pattern, "https://admin.dev.frf.app.fanzeal.com/report-issues/{{id}}");
  assert.equal(patternGroup.pages.length, 2);

  const staticGroup = groups.find((g) => !g.isPatternGroup);
  assert.ok(staticGroup);
  assert.equal(staticGroup.pattern, "https://admin.dev.frf.app.fanzeal.com/dashboard");
  assert.equal(staticGroup.pages.length, 1);
});

test("buildKnowledgeMarkdown renders global keywords, summary table, and screen details", () => {
  const mockKnowledge: CrawlKnowledgeResult = {
    startUrl: "https://example.com",
    generatedAt: "2026-11-08T00:00:00.000Z",
    ollamaModel: "qwen3:4b",
    totalScreens: 1,
    totalPatternGroups: 1,
    screens: [
      {
        screenId: "screen-001",
        pattern: "https://example.com/report-issues/{{id}}",
        screenName: "Issue Details Screen",
        screenType: "detail-view",
        isPatternGroup: true,
        sampleUrls: ["https://example.com/report-issues/ISS-1"],
        summary: "Allows triage of issue tickets.",
        purpose: "Manage bug reports.",
        keyWorkflows: ["Change status", "Assign owner"],
        dataEntities: ["Issue", "User"],
        uiComponents: ["Status Bar", "Details Panel"],
        keywords: ["issue", "bug", "triage"]
      }
    ],
    globalKeywords: ["issue", "bug", "triage"],
    siteSummary: "Knowledge summary."
  };

  const md = buildKnowledgeMarkdown(mockKnowledge);
  assert.match(md, /Issue Details Screen/);
  assert.match(md, /detail-view/);
  assert.match(md, /`issue` • `bug` • `triage`/);
  assert.match(md, /Change status/);
});

test("loadPageSnapshot prioritizes in-memory snapshot, snapshotFile, and fallback text", async () => {
  // Case 1: In-memory snapshot
  const pageWithMemorySnapshot: CrawledPage = {
    url: "https://example.com",
    finalUrl: "https://example.com",
    depth: 0,
    status: "ok",
    text: "fallback text",
    crawledAt: "",
    ...({ snapshot: "- button 'Submit'" } as any)
  };
  const snap1 = await loadPageSnapshot(pageWithMemorySnapshot);
  assert.equal(snap1, "- button 'Submit'");

  // Case 2: Fallback to text when snapshot file doesn't exist
  const pageWithFallback: CrawledPage = {
    url: "https://example.com/missing",
    finalUrl: "https://example.com/missing",
    depth: 1,
    status: "ok",
    snapshotFile: "pages/nonexistent.snapshot.txt",
    text: "Page fallback content",
    crawledAt: ""
  };
  const snap2 = await loadPageSnapshot(pageWithFallback, os.tmpdir());
  assert.equal(snap2, "Page fallback content");
});

test("handleRequest responds to GET / with API documentation", async () => {
  const { req, res, getStatus, getBody } = createMockReqRes("GET", "/");
  await handleRequest(req, res);

  assert.equal(getStatus(), 200);
  const body = getBody();
  assert.equal(body.name, "Local Website Scanner - AI Knowledge & RAG Engine");
  assert.ok(Array.isArray(body.endpoints));
});

test("handleRequest responds to OPTIONS with 204 CORS preflight", async () => {
  const { req, res, getStatus, getHeaders } = createMockReqRes("OPTIONS", "/api/knowledge");
  await handleRequest(req, res);

  assert.equal(getStatus(), 204);
  assert.equal(getHeaders()["Access-Control-Allow-Origin"], "*");
});

test("generateCrawlKnowledge uses ollama client to produce structured screen knowledge", async () => {
  const mockChatResponse = {
    message: {
      content: JSON.stringify({
        screenName: "Issues List & Filtering",
        screenType: "list-management",
        summary: "Displays all submitted issues with filters.",
        purpose: "Issue tracking and overview.",
        keyWorkflows: ["Search issues", "Filter by status"],
        dataEntities: ["Issue", "Tag"],
        uiComponents: ["Data Table", "Search Bar"],
        keywords: ["issues", "bugs", "filter", "tracking"]
      })
    }
  };

  const mockClient = {
    chat: async (params: any) => {
      assert.equal(params.model, "qwen3:4b");
      assert.equal(params.format, "json");
      return mockChatResponse;
    }
  } as any;

  const mockReport = {
    startUrl: "https://example.com",
    crawlStartedAt: "",
    crawlFinishedAt: "",
    durationMs: 0,
    config: {} as any,
    totals: {} as any,
    pages: [
      {
        url: "https://example.com/issues",
        finalUrl: "https://example.com/issues",
        depth: 1,
        status: "ok" as const,
        title: "All Issues",
        crawledAt: ""
      }
    ]
  };

  const result = await generateCrawlKnowledge({
    report: mockReport,
    ollamaClient: mockClient,
    ollamaModel: "qwen3:4b"
  });

  assert.equal(result.totalScreens, 1);
  assert.equal(result.screens[0]?.screenName, "Issues List & Filtering");
  assert.equal(result.screens[0]?.screenType, "list-management");
  assert.deepEqual(result.screens[0]?.keywords, ["issues", "bugs", "filter", "tracking"]);
  assert.ok(result.globalKeywords.includes("issues"));
});

test("persistScreenKnowledgeState and loadSavedScreenKnowledge handle incremental save and reload", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scanner-test-"));
  try {
    const screen1 = {
      screenId: "screen-001",
      pattern: "https://example.com/login",
      screenName: "Login Page",
      screenType: "auth",
      isPatternGroup: false,
      sampleUrls: ["https://example.com/login"],
      summary: "Sign-in portal.",
      purpose: "User authentication.",
      keyWorkflows: ["Enter credentials", "Log in"],
      dataEntities: ["User"],
      uiComponents: ["Email Input", "Password Input", "Login Button"],
      keywords: ["login", "auth", "signin"]
    };

    const intermediateResult: CrawlKnowledgeResult = {
      startUrl: "https://example.com",
      generatedAt: new Date().toISOString(),
      ollamaModel: "qwen3:4b",
      totalScreens: 1,
      totalPatternGroups: 0,
      screens: [screen1],
      globalKeywords: ["login", "auth"],
      siteSummary: "Summary"
    };

    await persistScreenKnowledgeState(tempDir, screen1, intermediateResult);

    assert.ok(fs.existsSync(path.join(tempDir, "screens", "screen-001.json")));
    assert.ok(fs.existsSync(path.join(tempDir, "knowledge.json")));
    assert.ok(fs.existsSync(path.join(tempDir, "knowledge.md")));

    const loadedMap = await loadSavedScreenKnowledge(tempDir);
    assert.equal(loadedMap.size, 1);
    assert.ok(loadedMap.has("https://example.com/login"));
    assert.equal(loadedMap.get("https://example.com/login")?.screenName, "Login Page");
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("generateCrawlKnowledge reuses saved screen knowledge and only invokes Ollama for new screens", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scanner-test-resume-"));
  try {
    const calls: string[] = [];
    const mockClient = {
      chat: async () => {
        calls.push("chat-called");
        return {
          message: {
            content: JSON.stringify({
              screenName: "Dashboard Overview",
              screenType: "dashboard",
              summary: "Main analytics dashboard.",
              purpose: "Monitor key metrics.",
              keyWorkflows: ["View metrics"],
              dataEntities: ["Stats"],
              uiComponents: ["Chart Panel"],
              keywords: ["dashboard", "analytics", "stats"]
            })
          }
        };
      }
    } as any;

    // Pre-populate tempDir with a saved analysis for https://example.com/login
    const existingScreen = {
      screenId: "screen-001",
      pattern: "https://example.com/login",
      screenName: "Saved Login Page",
      screenType: "auth",
      isPatternGroup: false,
      sampleUrls: ["https://example.com/login"],
      summary: "Saved login portal.",
      purpose: "User authentication.",
      keyWorkflows: ["Login"],
      dataEntities: ["User"],
      uiComponents: ["Form"],
      keywords: ["login", "auth"],
      isFallback: false
    };

    const initialResult: CrawlKnowledgeResult = {
      startUrl: "https://example.com",
      generatedAt: new Date().toISOString(),
      ollamaModel: "qwen3:4b",
      totalScreens: 1,
      totalPatternGroups: 0,
      screens: [existingScreen],
      globalKeywords: ["login", "auth"],
      siteSummary: "Initial"
    };

    await persistScreenKnowledgeState(tempDir, existingScreen, initialResult);

    // Now run generateCrawlKnowledge with a report containing BOTH /login and /dashboard
    const mockReport = {
      startUrl: "https://example.com",
      crawlStartedAt: "",
      crawlFinishedAt: "",
      durationMs: 0,
      config: {} as any,
      totals: {} as any,
      pages: [
        {
          url: "https://example.com/login",
          finalUrl: "https://example.com/login",
          depth: 1,
          status: "ok" as const,
          title: "Login",
          crawledAt: ""
        },
        {
          url: "https://example.com/dashboard",
          finalUrl: "https://example.com/dashboard",
          depth: 1,
          status: "ok" as const,
          title: "Dashboard",
          crawledAt: ""
        }
      ]
    };

    const res = await generateCrawlKnowledge({
      runDir: tempDir,
      report: mockReport,
      ollamaClient: mockClient,
      ollamaModel: "qwen3:4b"
    });

    // Only /dashboard should have called Ollama chat! /login was reused from saved
    assert.equal(calls.length, 1);
    assert.equal(res.totalScreens, 2);

    const loginScreen = res.screens.find((s) => s.pattern === "https://example.com/login");
    const dashboardScreen = res.screens.find((s) => s.pattern === "https://example.com/dashboard");

    assert.equal(loginScreen?.screenName, "Saved Login Page"); // reused from saved
    assert.equal(dashboardScreen?.screenName, "Dashboard Overview"); // analyzed by Ollama

    // Both screen artifact files should exist
    assert.ok(fs.existsSync(path.join(tempDir, "screens", "screen-001.json")));
    assert.ok(fs.existsSync(path.join(tempDir, "screens", "screen-002.json")));

    // When run again without forceReanalyze, zero Ollama calls should be made!
    calls.length = 0;
    const resRepeat = await generateCrawlKnowledge({
      runDir: tempDir,
      report: mockReport,
      ollamaClient: mockClient,
      ollamaModel: "qwen3:4b"
    });

    assert.equal(calls.length, 0);
    assert.equal(resRepeat.totalScreens, 2);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
