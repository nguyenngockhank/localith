import { ChromaClient, type ChromaClientArgs } from "chromadb";

export interface ChromaConnectionOptions {
  chromaUrl?: string;
  chromaHost?: string;
  chromaPort?: number;
  chromaSsl?: boolean;
  tenant?: string;
  database?: string;
}

/**
 * Creates and returns an instantiated ChromaClient.
 */
export function getChromaClient(options?: ChromaConnectionOptions): ChromaClient {
  const args = parseChromaOptions(options);
  return new ChromaClient(args);
}


/**
 * Parses connection parameters from options or environment variables.
 */
export function parseChromaOptions(options?: ChromaConnectionOptions): ChromaClientArgs {
  const targetUrl = options?.chromaUrl || process.env.CHROMA_URL;

  let host = options?.chromaHost || process.env.CHROMA_HOST || "127.0.0.1";
  let port = options?.chromaPort ? Number(options.chromaPort) : process.env.CHROMA_PORT ? Number(process.env.CHROMA_PORT) : 8000;
  let ssl = options?.chromaSsl ?? (process.env.CHROMA_SSL === "true");

  if (targetUrl) {
    try {
      const u = new URL(targetUrl);
      host = u.hostname;
      port = u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80);
      ssl = u.protocol === "https:";
    } catch {
      // Keep existing host/port
    }
  }

  const tenant = options?.tenant || process.env.CHROMA_TENANT;
  const database = options?.database || process.env.CHROMA_DATABASE;

  const clientArgs: ChromaClientArgs = {
    host,
    port,
    ssl
  };

  if (tenant) clientArgs.tenant = tenant;
  if (database) clientArgs.database = database;

  return clientArgs;
}
