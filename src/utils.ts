
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid",
  "ref", "ref_src", "source", "igshid"
]);

export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    // Normalize the common equivalent form /path and /path/
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

export function isInScope(
  candidate: string,
  start: URL,
  includeSubdomains: boolean
): boolean {
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return false;

    const startHost = start.hostname.toLowerCase();
    const candidateHost = url.hostname.toLowerCase();

    if (candidateHost === startHost) return true;
    return includeSubdomains && candidateHost.endsWith(`.${startHost}`);
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function relativeReportPath(runDir: string, filePath: string): string {
  return path.relative(runDir, filePath).split(path.sep).join("/");
}

export async function readJsonFile<T>(file: string): Promise<T> {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as T;
}