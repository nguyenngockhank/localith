import type { ChatRequest, Ollama } from "ollama";

/**
 * Runs an Ollama chat request and returns the full reply text.
 *
 * The reply is streamed and collected here. A non-streaming request sends no
 * response headers until generation finishes, and Node's fetch gives up after
 * 5 minutes without headers, so slow (CPU-only) machines failed with
 * "fetch failed" on longer prompts.
 */
export async function chatText(
  client: Ollama,
  request: Omit<ChatRequest, "stream">
): Promise<string> {
  const response: unknown = await client.chat({ ...request, stream: true });

  if (response && typeof (response as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
    let content = "";
    for await (const part of response as AsyncIterable<{ message?: { content?: string } }>) {
      content += part.message?.content ?? "";
    }
    return content;
  }

  // Clients that ignore `stream` (e.g. test doubles) return the whole message at once.
  return (response as { message?: { content?: string } } | null)?.message?.content ?? "";
}
