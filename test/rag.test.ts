import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { sanitizeCollectionName, parseChromaOptions } from "../src/rag/chromaClient.js";
import {
  buildKnowledgeChunks,
  buildScreenChunk,
  buildWorkflowChunks,
  buildSiteOverviewChunk
} from "../src/rag/chunkKnowledge.js";
import { generateEmbeddings, indexKnowledgeToChroma } from "../src/rag/indexKnowledge.js";
import { searchRag, synthesizeRagAnswer } from "../src/rag/searchRag.js";
import { handleRequest } from "../src/server.js";
import type { CrawlKnowledgeResult, ScreenKnowledge } from "../src/types.js";

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

const sampleScreen: ScreenKnowledge = {
  screenId: "screen-001",
  pattern: "https://example.com/reports",
  screenName: "Reports & Analytics Center",
  screenType: "dashboard",
  isPatternGroup: false,
  sampleUrls: ["https://example.com/reports"],
  summary: "Allows users to generate, view, and export system reports.",
  purpose: "Business intelligence and metrics reporting.",
  keyWorkflows: [
    "Create a new report",
    "Filter reports by date range",
    "Export report to CSV/PDF"
  ],
  dataEntities: ["Report", "User", "Metric"],
  uiComponents: ["Create Button", "Date Picker", "Export Dropdown", "Data Table"],
  keywords: ["report", "analytics", "export", "dashboard"]
};

const sampleKnowledge: CrawlKnowledgeResult = {
  startUrl: "https://example.com",
  generatedAt: "2026-11-09T00:00:00.000Z",
  ollamaModel: "qwen3.5:4b",
  totalScreens: 1,
  totalPatternGroups: 0,
  screens: [sampleScreen],
  globalKeywords: ["report", "analytics", "export", "dashboard"],
  siteSummary: "Enterprise reporting portal."
};

test("sanitizeCollectionName formats dynamic names into valid Chroma collection names", () => {
  assert.equal(sanitizeCollectionName("My Cool App!"), "my_cool_app");
  assert.equal(sanitizeCollectionName("https://admin.dev.frf.app.fanzeal.com"), "https_admin_dev_frf_app_fanzeal_com");
  assert.equal(sanitizeCollectionName("a"), "a_rag_kb");
  assert.equal(sanitizeCollectionName("---test_collection---"), "test_collection");
  assert.equal(sanitizeCollectionName(""), "app_knowledge_base");
});

test("parseChromaOptions extracts connection parameters from env and options", () => {
  const custom = parseChromaOptions({
    chromaUrl: "https://my-chroma.internal:9000",
    database: "prod_db",
    tenant: "team_a"
  });
  assert.equal(custom.host, "my-chroma.internal");
  assert.equal(custom.port, 9000);
  assert.equal(custom.ssl, true);
  assert.equal(custom.database, "prod_db");
  assert.equal(custom.tenant, "team_a");
});

test("buildKnowledgeChunks creates overview, workflow, and site chunks", () => {
  const chunks = buildKnowledgeChunks(sampleKnowledge);

  // 1 site overview + 1 screen overview + 3 workflows = 5 chunks
  assert.equal(chunks.length, 5);

  const siteOverview = chunks.find((c) => c.id === "global-site-overview");
  assert.ok(siteOverview);
  assert.equal(siteOverview.metadata.chunkType, "site_overview");

  const screenOverview = chunks.find((c) => c.id === "screen-001-overview");
  assert.ok(screenOverview);
  assert.equal(screenOverview.metadata.screenName, "Reports & Analytics Center");
  assert.match(screenOverview.document, /Reports & Analytics Center/);
  assert.match(screenOverview.document, /Create a new report/);

  const workflowChunks = chunks.filter((c) => c.metadata.chunkType === "workflow");
  assert.equal(workflowChunks.length, 3);
  assert.equal(workflowChunks[0]?.metadata.workflow, "Create a new report");
  assert.match(workflowChunks[0]?.document ?? "", /Action \/ Workflow: Create a new report/);
});

test("generateEmbeddings invokes ollama.embed in batches", async () => {
  let batchCalls = 0;
  const mockOllama = {
    embed: async (args: any) => {
      batchCalls++;
      assert.equal(args.model, "nomic-embed-text");
      return {
        embeddings: args.input.map(() => [0.1, 0.2, 0.3])
      };
    }
  } as any;

  const texts = ["t1", "t2", "t3", "t4", "t5"];
  const embeddings = await generateEmbeddings(mockOllama, texts, "nomic-embed-text", 2);

  assert.equal(embeddings.length, 5);
  assert.equal(batchCalls, 3); // 2 + 2 + 1
});

test("indexKnowledgeToChroma creates collection with dynamic name and upserts vectors", async () => {
  let createdCollectionName = "";
  let upsertedIds: string[] = [];
  let upsertedDocs: string[] = [];
  let upsertedVectors: number[][] = [];

  const mockCollection = {
    upsert: async (args: any) => {
      upsertedIds.push(...args.ids);
      upsertedDocs.push(...args.documents);
      upsertedVectors.push(...args.embeddings);
    }
  };

  const mockChroma = {
    getOrCreateCollection: async (args: any) => {
      createdCollectionName = args.name;
      return mockCollection;
    }
  };

  const mockOllama = {
    embed: async (args: any) => ({
      embeddings: args.input.map(() => [0.05, 0.15, 0.25])
    })
  };

  const result = await indexKnowledgeToChroma({
    collectionName: "Fanzeal Customer Knowledge",
    knowledge: sampleKnowledge,
    chromaClient: mockChroma,
    ollamaClient: mockOllama,
    embedModel: "nomic-embed-text"
  });

  assert.equal(result.collectionName, "fanzeal_customer_knowledge");
  assert.equal(result.totalChunks, 5);
  assert.equal(result.screensCount, 1);
  assert.equal(createdCollectionName, "fanzeal_customer_knowledge");
  assert.equal(upsertedIds.length, 5);
  assert.equal(upsertedVectors.length, 5);
});

test("searchRag queries ChromaDB with query embedding and synthesizes answer", async () => {
  const mockCollection = {
    query: async (args: any) => {
      assert.ok(args.queryEmbeddings);
      return {
        ids: [["screen-001-wf-1", "screen-001-overview"]],
        documents: [[
          "Screen: Reports & Analytics Center\nAction / Workflow: Create a new report\nHow it works: Click the Create button to open the report builder.",
          "Screen: Reports & Analytics Center\nPurpose: Business intelligence and metrics reporting."
        ]],
        metadatas: [[
          {
            screenId: "screen-001",
            screenName: "Reports & Analytics Center",
            screenType: "dashboard",
            pattern: "https://example.com/reports",
            chunkType: "workflow",
            workflow: "Create a new report",
            url: "https://example.com/reports"
          },
          {
            screenId: "screen-001",
            screenName: "Reports & Analytics Center",
            screenType: "dashboard",
            pattern: "https://example.com/reports",
            chunkType: "screen_overview",
            url: "https://example.com/reports"
          }
        ]],
        distances: [[0.15, 0.25]]
      };
    }
  };

  const mockChroma = {
    getCollection: async (args: any) => {
      assert.equal(args.name, "reports-kb");
      return mockCollection;
    }
  };

  let askedPrompt = "";
  const mockOllama = {
    embed: async (args: any) => {
      assert.equal(args.model, "nomic-embed-text");
      return { embeddings: [[0.1, 0.2, 0.3]] };
    },
    chat: async (args: any) => {
      askedPrompt = args.messages[0].content;
      return {
        message: {
          content: "To create a report, go to the Reports & Analytics Center at https://example.com/reports and click the Create button."
        }
      };
    }
  };

  const searchResult = await searchRag({
    query: "how can I create a report?",
    collectionName: "reports-kb",
    chromaClient: mockChroma,
    ollamaClient: mockOllama,
    embedModel: "nomic-embed-text",
    generateAnswer: true
  });

  assert.equal(searchResult.resultsCount, 2);
  assert.equal(searchResult.results[0]?.screenName, "Reports & Analytics Center");
  assert.equal(searchResult.results[0]?.metadata?.workflow, "Create a new report");
  assert.equal(searchResult.results[0]?.distance, 0.15);
  assert.equal(searchResult.results[0]?.score, 0.85);

  assert.match(searchResult.answer ?? "", /To create a report, go to the Reports & Analytics Center/);
  assert.match(askedPrompt, /how can I create a report\?/);
});

test("synthesizeRagAnswer generates clear message when no results are found", async () => {
  const mockOllama = {} as any;
  const answer = await synthesizeRagAnswer(mockOllama, "qwen3.5:4b", "how to fly?", []);
  assert.match(answer, /No relevant screens or workflows were found/);
});

test("handleRequest handles POST /api/rag/search endpoint with validation", async () => {
  // Empty query should return 400
  const { req, res, getStatus, getBody } = createMockReqRes("POST", "/api/rag/search", {});
  await handleRequest(req, res);

  assert.equal(getStatus(), 400);
  const body = getBody();
  assert.match(body.error, /Query is required/);
});

test("handleRequest handles GET /api/rag/search endpoint with validation", async () => {
  // Missing 'q' should return 400
  const { req, res, getStatus, getBody } = createMockReqRes("GET", "/api/rag/search");
  await handleRequest(req, res);

  assert.equal(getStatus(), 400);
  const body = getBody();
  assert.match(body.error, /Missing required query parameter/);
});
