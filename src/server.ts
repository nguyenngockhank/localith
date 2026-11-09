import http from "node:http";
import fs from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { generateCrawlKnowledge } from "./knowledge/generateScreenKnowledge.js";
import { indexKnowledgeToChroma } from "./rag/indexKnowledge/indexKnowledge.js";
import { searchRag } from "./rag/searchRag.js";
import { getChromaClient } from "./rag/chromaClient/chromaClient.js";
import type { CrawlReport, CrawlKnowledgeResult, IndexKnowledgeOptions, SearchRagOptions } from "./types.js";

const PORT = Number(process.env.PORT || 3000);
const REPORTS_DIR = path.join(process.cwd(), "reports");

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

async function parseBody<T = unknown>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch (err) {
        reject(new Error("Invalid JSON in request body."));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Finds the latest report directory under reports/
 */
async function getLatestReportDir(): Promise<string | null> {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const entries = await readdir(REPORTS_DIR, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(REPORTS_DIR, e.name))
    .filter((dir) => fs.existsSync(path.join(dir, "report.json")));

  if (dirs.length === 0) return null;

  // Sort by modification time descending
  dirs.sort((a, b) => {
    const statA = fs.statSync(path.join(a, "report.json")).mtimeMs;
    const statB = fs.statSync(path.join(b, "report.json")).mtimeMs;
    return statB - statA;
  });

  return dirs[0] ?? null;
}

export async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method ?? "GET";

  try {
    // 1. Root API Discovery / Help
    if (pathname === "/" && method === "GET") {
      sendJson(res, 200, {
        name: "Local Website Scanner - AI Knowledge & RAG Engine",
        description: "Consumes crawl results to produce knowledge and powers RAG search using ChromaDB and Ollama nomic-embed-text.",
        endpoints: [
          { method: "POST", path: "/api/knowledge", description: "Generate screen knowledge and keywords from crawl result." },
          { method: "POST", path: "/api/analyze", description: "Alias for /api/knowledge." },
          { method: "GET", path: "/api/reports", description: "List available crawl reports." },
          { method: "GET", path: "/api/reports/:id/knowledge", description: "Get saved knowledge for a specific report run." },
          { method: "POST", path: "/api/reports/:id/knowledge", description: "Generate knowledge for a specific report run." },
          { method: "POST", path: "/api/rag/index", description: "Index knowledge.json into ChromaDB using nomic-embed-text." },
          { method: "POST", path: "/api/rag/search", description: "Search ChromaDB with question query and return AI answer + matching screens." },
          { method: "GET", path: "/api/rag/search", description: "Query RAG database via query parameters (?q=...&collection=...)." },
          { method: "GET", path: "/api/rag/collections", description: "List ChromaDB collections." },
          { method: "GET", path: "/health", description: "Check server, Ollama, and ChromaDB status." }
        ]
      });
      return;
    }

    // 2. Health Check
    if (pathname === "/health" && method === "GET") {
      const ollamaUrl = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
      let ollamaOk = false;
      try {
        const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        ollamaOk = resp.ok;
      } catch {
        ollamaOk = false;
      }

      let chromaOk = false;
      try {
        const chroma = getChromaClient();
        await chroma.version();
        chromaOk = true;
      } catch {
        chromaOk = false;
      }

      sendJson(res, 200, {
        status: "ok",
        ollamaUrl,
        ollamaConnected: ollamaOk,
        chromaConnected: chromaOk,
        defaultModel: process.env.OLLAMA_MODEL ?? "qwen3.5:4b",
        defaultEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text"
      });
      return;
    }

    // 3. List Reports
    if (pathname === "/api/reports" && method === "GET") {
      if (!fs.existsSync(REPORTS_DIR)) {
        sendJson(res, 200, { reports: [] });
        return;
      }
      const entries = await readdir(REPORTS_DIR, { withFileTypes: true });
      const reportsList = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const reportJson = path.join(REPORTS_DIR, entry.name, "report.json");
        const knowledgeJson = path.join(REPORTS_DIR, entry.name, "knowledge.json");
        if (fs.existsSync(reportJson)) {
          try {
            const meta = JSON.parse(await readFile(reportJson, "utf8")) as CrawlReport;
            reportsList.push({
              id: entry.name,
              startUrl: meta.startUrl,
              startedAt: meta.startedAt,
              finishedAt: meta.finishedAt,
              pagesCount: meta.pages?.length ?? 0,
              hasKnowledge: fs.existsSync(knowledgeJson)
            });
          } catch {
            reportsList.push({ id: entry.name, hasKnowledge: fs.existsSync(knowledgeJson) });
          }
        }
      }
      sendJson(res, 200, { reports: reportsList });
      return;
    }

    // 4. Specific Report Knowledge: GET /api/reports/:id/knowledge
    const reportKnowledgeMatch = pathname.match(/^\/api\/reports\/([^/]+)\/knowledge$/);
    if (reportKnowledgeMatch) {
      const reportId = decodeURIComponent(reportKnowledgeMatch[1]!);
      const targetDir = path.join(REPORTS_DIR, reportId);
      const knowledgePath = path.join(targetDir, "knowledge.json");
      const reportPath = path.join(targetDir, "report.json");

      if (!fs.existsSync(targetDir) || !fs.existsSync(reportPath)) {
        sendJson(res, 404, { error: `Report "${reportId}" not found.` });
        return;
      }

      if (method === "GET") {
        if (!fs.existsSync(knowledgePath)) {
          sendJson(res, 404, {
            error: `Knowledge not yet generated for report "${reportId}". POST to /api/reports/${reportId}/knowledge to generate.`
          });
          return;
        }
        const raw = await readFile(knowledgePath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "POST") {
        const body = await parseBody<{
          ollamaUrl?: string;
          ollamaModel?: string;
          forceReanalyze?: boolean;
          force?: boolean;
        }>(req);
        const knowledge = await generateCrawlKnowledge({
          runDir: targetDir,
          reportPath,
          ollamaUrl: body.ollamaUrl,
          ollamaModel: body.ollamaModel,
          forceReanalyze: body.forceReanalyze ?? body.force
        });
        sendJson(res, 200, { success: true, reportId, data: knowledge });
        return;
      }
    }

    // 5. Main AI Knowledge Endpoint: POST /api/knowledge (or /api/analyze)
    if ((pathname === "/api/knowledge" || pathname === "/api/analyze") && method === "POST") {
      interface AnalyzePayload {
        report?: CrawlReport;
        reportPath?: string;
        runDir?: string;
        ollamaUrl?: string;
        ollamaModel?: string;
        forceReanalyze?: boolean;
        force?: boolean;
      }

      const body = await parseBody<AnalyzePayload>(req);

      let targetRunDir = body.runDir;
      let targetReportPath = body.reportPath;
      let targetReport = body.report;

      // If no target specified in request, fallback to latest report directory
      if (!targetReport && !targetReportPath && !targetRunDir) {
        const latest = await getLatestReportDir();
        if (!latest) {
          sendJson(res, 400, {
            error: "No crawl result provided and no existing reports found in ./reports. Run a crawl first or provide 'report' in request body."
          });
          return;
        }
        targetRunDir = latest;
      }

      console.log(`\n🧠 Processing Knowledge & Keywords request for ${targetRunDir || targetReportPath || "in-memory report"}...`);

      const result = await generateCrawlKnowledge({
        report: targetReport,
        reportPath: targetReportPath,
        runDir: targetRunDir,
        ollamaUrl: body.ollamaUrl,
        ollamaModel: body.ollamaModel,
        forceReanalyze: body.forceReanalyze ?? body.force
      });

      console.log(`   ✓ Knowledge generated: ${result.totalScreens} screens (${result.totalPatternGroups} pattern groups), ${result.globalKeywords.length} global keywords.`);

      sendJson(res, 200, {
        success: true,
        data: result
      });
      return;
    }

    // 6. RAG Indexing Endpoint: POST /api/rag/index
    if (pathname === "/api/rag/index" && method === "POST") {
      const body = await parseBody<IndexKnowledgeOptions>(req);
      console.log(`\n📚 Processing RAG index request for collection "${body.collectionName || "(auto)"}"...`);

      const indexResult = await indexKnowledgeToChroma(body);
      console.log(`   ✓ Indexed ${indexResult.totalChunks} chunks into collection "${indexResult.collectionName}".`);

      sendJson(res, 200, {
        success: true,
        data: indexResult
      });
      return;
    }

    // 7. RAG Search Endpoint: POST /api/rag/search or /api/rag/query
    if ((pathname === "/api/rag/search" || pathname === "/api/rag/query") && method === "POST") {
      const body = await parseBody<SearchRagOptions>(req);
      if (!body.query) {
        sendJson(res, 400, { error: "Query is required in request body: { query: 'how can I create a report?' }" });
        return;
      }

      console.log(`\n🔎 RAG search: "${body.query}" on collection "${body.collectionName || "(default)"}"...`);
      const searchResult = await searchRag(body);

      sendJson(res, 200, {
        success: true,
        data: searchResult
      });
      return;
    }

    // 8. RAG Search GET Endpoint: GET /api/rag/search?q=...&collection=...
    if (pathname === "/api/rag/search" && method === "GET") {
      const query = parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("query");
      if (!query) {
        sendJson(res, 400, {
          error: "Missing required query parameter 'q' or 'query'. Example: /api/rag/search?q=how+can+I+create+a+report"
        });
        return;
      }
      const collectionName = parsedUrl.searchParams.get("collection") || parsedUrl.searchParams.get("collectionName") || undefined;
      const nResultsParam = parsedUrl.searchParams.get("n") || parsedUrl.searchParams.get("nResults");
      const nResults = nResultsParam ? parseInt(nResultsParam, 10) : 5;
      const generateAnswer = parsedUrl.searchParams.get("generateAnswer") !== "false";

      const searchResult = await searchRag({
        query,
        collectionName,
        nResults,
        generateAnswer
      });

      sendJson(res, 200, {
        success: true,
        data: searchResult
      });
      return;
    }

    // 9. List ChromaDB Collections: GET /api/rag/collections
    if (pathname === "/api/rag/collections" && method === "GET") {
      try {
        const chroma = getChromaClient();
        const collections = await chroma.listCollections();
        sendJson(res, 200, {
          success: true,
          count: collections.length,
          collections: collections.map((c) => ({
            name: c.name,
            id: c.id,
            metadata: c.metadata
          }))
        });
      } catch (cErr) {
        sendJson(res, 502, {
          error: "Failed to connect to ChromaDB server",
          message: (cErr as Error).message
        });
      }
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
  } catch (error) {
    console.error("Server error:", error);
    sendJson(res, 500, {
      error: "Internal server error",
      message: (error as Error).message
    });
  }
}

export function createKnowledgeServer(): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res);
  });
}

// Start server if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createKnowledgeServer();
  server.listen(PORT, () => {
    console.log(`\n🚀 Local Website Scanner - AI Knowledge & RAG Server running on http://localhost:${PORT}`);
    console.log(`   POST /api/knowledge    -> Generate knowledge from crawl results`);
    console.log(`   POST /api/rag/index    -> Index knowledge into ChromaDB with nomic-embed-text`);
    console.log(`   POST /api/rag/search   -> Semantic search & AI answers from ChromaDB`);
    console.log(`   GET  /api/rag/search   -> Query RAG via GET (?q=...)`);
    console.log(`   GET  /api/reports      -> List all crawl reports`);
    console.log(`   GET  /health           -> Check server, Ollama, and ChromaDB status\n`);
  });
}
