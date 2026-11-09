import type { CrawlOptions } from "./types.js";

export function printHelp(): void {
  console.log(`
Local Website Scanner

Usage:
  npm run scan -- <url> [options]

Options:
  --depth <n>             Maximum crawl depth (default: 3)
  --max-pages <n>         Maximum pages to visit (default: 200)
  --max-pattern-pages <n> Maximum pages per dynamic pattern at depth > 1 (default: 3)
  --fresh                 Start a fresh scan, ignoring previous run data and saved queue
  --delay-ms <n>          Delay between pages in milliseconds (default: 900)
  --knowledge             Generate screen & pattern knowledge + keywords with Ollama
  --include-subdomains    Include subdomains of the starting host
  --ignore-robots         Ignore robots.txt (not recommended)
  --auth                  Detect login walls and sign in using AUTH_EMAIL/AUTH_PASSWORD
  --auth-email <e>        Login email (overrides AUTH_EMAIL)
  --auth-password <p>     Login password (overrides AUTH_PASSWORD)
  --help                  Show this help
  --screenshot            Capture screenshots of each page

Examples:
  npm run scan -- https://example.com
  npm run scan -- https://example.com --depth 3 --max-pages 100
`);
}

export function parseOptions(argv: string[]): CrawlOptions | null {
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    printHelp();
    return null;
  }

  const valueOptions = new Set([
    "--depth",
    "--max-pages",
    "--max-pattern-pages",
    "--delay-ms",
    "--auth-email",
    "--auth-password"
  ]);
  let startUrl: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (valueOptions.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    startUrl = arg;
    break;
  }
  if (!startUrl) {
    printHelp();
    throw new Error("Please provide a starting URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(startUrl);
  } catch {
    throw new Error(`Invalid URL: ${startUrl}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  const maxDepth = Number(readFlag(argv, "--depth") ?? process.env.CRAWL_DEPTH ?? 3);
  const maxPages = Number(readFlag(argv, "--max-pages") ?? process.env.MAX_PAGES ?? 200);
  const maxPagesPerPattern = Number(
    readFlag(argv, "--max-pattern-pages") ?? process.env.MAX_PAGES_PER_PATTERN ?? 3
  );
  const delayMs = Number(readFlag(argv, "--delay-ms") ?? process.env.CRAWL_DELAY_MS ?? 900);

  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 10) {
    throw new Error("--depth must be an integer from 0 to 10.");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10000) {
    throw new Error("--max-pages must be an integer from 1 to 10000.");
  }
  if (!Number.isInteger(maxPagesPerPattern) || maxPagesPerPattern < 1 || maxPagesPerPattern > 1000) {
    throw new Error("--max-pattern-pages must be an integer from 1 to 1000.");
  }
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60000) {
    throw new Error("--delay-ms must be between 0 and 60000.");
  }

  const includeSubdomains =
    hasFlag(argv, "--include-subdomains") ||
    process.env.INCLUDE_SUBDOMAINS?.toLowerCase() === "true";

  const ignoreRobots = hasFlag(argv, "--ignore-robots");

  const authEnabled = hasFlag(argv, "--auth");
  const authEmail = readFlag(argv, "--auth-email") ?? process.env.AUTH_EMAIL;
  const authPassword = readFlag(argv, "--auth-password") ?? process.env.AUTH_PASSWORD;

  if (authEnabled && (!authEmail || !authPassword)) {
    throw new Error(
      "--auth requires credentials. Set AUTH_EMAIL and AUTH_PASSWORD in .env, or pass --auth-email and --auth-password."
    );
  }

  return {
    startUrl: parsed.toString(),
    maxDepth,
    maxPages,
    maxPagesPerPattern,
    delayMs,
    pageTimeoutMs: envNumber("PAGE_TIMEOUT_MS", 30000),
    maxSnapshotChars: envNumber("MAX_SNAPSHOT_CHARS", 18000),
    maxPageTextChars: envNumber("MAX_PAGE_TEXT_CHARS", 16000),
    screenshot: hasFlag(argv, "--screenshot"),
    generateKnowledge: hasFlag(argv, "--knowledge"),
    includeSubdomains,
    respectRobots: !ignoreRobots && process.env.RESPECT_ROBOTS !== "false",
    fresh: hasFlag(argv, "--fresh"),
    auth: {
      enabled: authEnabled,
      email: authEmail,
      password: authPassword
    },
    ollamaUrl: (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3:4b"
  };
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readFlag(args: string[], name: string): string | undefined {
  const exact = args.indexOf(name);
  if (exact >= 0) return args[exact + 1];
  const prefix = args.find((arg) => arg.startsWith(`${name}=`));
  return prefix?.slice(name.length + 1);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}