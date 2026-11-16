import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:events";
import type http from "node:http";
import { handleRequest, resolveReportDir } from "../src/server.js";

function createMockReqRes(method: string, url: string, headers: Record<string, string> = {}) {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000", ...headers };

  let statusCode = 200;
  let responseHeaders: Record<string, string> = {};
  let body = "";
  const res = {
    writeHead(code: number, hdrs: Record<string, string>) {
      statusCode = code;
      responseHeaders = hdrs;
    },
    end(data?: string) {
      if (data) body += data;
    }
  } as unknown as http.ServerResponse;

  process.nextTick(() => req.emit("end"));
  return { req, res, status: () => statusCode, headers: () => responseHeaders, body: () => body };
}

test("resolveReportDir accepts plain report ids and rejects path traversal", () => {
  assert.equal(
    resolveReportDir("example-com-5ab12345"),
    path.join(process.cwd(), "reports", "example-com-5ab12345")
  );
  assert.equal(resolveReportDir(".."), null);
  assert.equal(resolveReportDir("../secrets"), null);
  assert.equal(resolveReportDir("a/b"), null);
  assert.equal(resolveReportDir("a\b"), null);
  assert.equal(resolveReportDir(""), null);
});

test("GET /ui serves the web UI as HTML", async () => {
  const mock = createMockReqRes("GET", "/ui");
  await handleRequest(mock.req, mock.res);
  assert.equal(mock.status(), 200);
  assert.match(mock.headers()["Content-Type"] ?? "", /text\/html/);
  assert.match(mock.body(), /<title>Localith<\/title>/);
});

test("GET / serves the web UI to browsers and JSON to API clients", async () => {
  const browser = createMockReqRes("GET", "/", { accept: "text/html,application/xhtml+xml" });
  await handleRequest(browser.req, browser.res);
  assert.match(browser.headers()["Content-Type"] ?? "", /text\/html/);

  const client = createMockReqRes("GET", "/", { accept: "*/*" });
  await handleRequest(client.req, client.res);
  assert.match(client.headers()["Content-Type"] ?? "", /application\/json/);
  assert.ok(Array.isArray(JSON.parse(client.body()).endpoints));
});

test("report endpoints reject ids that escape the reports directory", async () => {
  for (const url of ["/api/reports/..%2F..%2Fsrc", "/api/reports/..%2F..%2Fsrc/knowledge"]) {
    const mock = createMockReqRes("GET", url);
    await handleRequest(mock.req, mock.res);
    assert.equal(mock.status(), 400, url);
  }
});

test("GET /api/reports/:id returns 404 for an unknown report", async () => {
  const mock = createMockReqRes("GET", "/api/reports/does-not-exist-00000000");
  await handleRequest(mock.req, mock.res);
  assert.equal(mock.status(), 404);
});
