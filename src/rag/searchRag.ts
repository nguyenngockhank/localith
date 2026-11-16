import { Ollama } from "ollama";
import type {
  RagSearchResultItem,
  SearchRagOptions,
  SearchRagResult
} from "../types.js";
import { getChromaClient } from "./chromaClient/chromaClient.js";
import { sanitizeCollectionName } from "./chromaClient/sanitizeCollectionName.js";
import { generateEmbeddings } from "./indexKnowledge/indexKnowledge.js";
import { getOllamaClient } from "../ollama/getOllamaClient.js";
import { chatText } from "../ollama/chatText.js";

/**
 * Searches the ChromaDB RAG database using vector similarity and returns matching screens,
 * workflows, and an optional AI synthesized answer.
 */
export async function searchRag(
  options: SearchRagOptions
): Promise<SearchRagResult> {
  const query = options.query?.trim();
  if (!query) {
    throw new Error("Search query cannot be empty.");
  }

  const collectionName = sanitizeCollectionName(options.collectionName);
  const nResults = options.nResults ?? 5;
  const embedModel = options.embedModel ?? process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

  const { ollamaClient: ollama, ollamaModel } = getOllamaClient({
    ollamaClient: options.ollamaClient,
    ollamaUrl: options.ollamaUrl,
    ollamaModel: options.ollamaModel
  })

  // 1. Connect to ChromaDB and get collection
  const chroma = options.chromaClient ?? getChromaClient(options);
  let collection;
  try {
    collection = await chroma.getCollection({ name: collectionName });
  } catch (err) {
    throw new Error(
      `ChromaDB collection "${collectionName}" not found. Did you run the indexing step first? Error: ${(err as Error).message}`
    );
  }

  // 2. Generate embedding for query using nomic-embed-text
  const queryEmbeddings = await generateEmbeddings(ollama, [query], embedModel);
  const queryVector = queryEmbeddings[0];
  if (!queryVector) {
    throw new Error("Failed to generate embedding vector for search query.");
  }

  // 3. Perform vector similarity query in ChromaDB
  const chromaResponse = await collection.query({
    queryEmbeddings: [queryVector],
    nResults,
    include: ["documents", "metadatas", "distances"]
  });

  // 4. Format search results
  const items: RagSearchResultItem[] = [];
  const ids = chromaResponse.ids?.[0] ?? [];
  const docs = chromaResponse.documents?.[0] ?? [];
  const metas = chromaResponse.metadatas?.[0] ?? [];
  const distances = chromaResponse.distances?.[0] ?? [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const document = docs[i] ?? "";
    const meta = (metas[i] ?? {}) as Record<string, any>;
    const distance = distances[i] ?? undefined;
    const score = distance != null ? Math.max(0, parseFloat((1 - distance).toFixed(4))) : undefined;

    items.push({
      id,
      screenId: meta.screenId,
      screenName: meta.screenName,
      screenType: meta.screenType,
      pattern: meta.pattern,
      chunkType: meta.chunkType,
      url: meta.url,
      document,
      score,
      distance: distance != null ? parseFloat(distance.toFixed(4)) : undefined,
      metadata: meta
    });
  }

  // 5. Optional LLM answer synthesis
  let answer: string | undefined;
  if (options.generateAnswer !== false) {
    answer = await synthesizeRagAnswer(ollama, ollamaModel, query, items);
  }

  return {
    query,
    collectionName,
    resultsCount: items.length,
    results: items,
    answer
  };
}

/**
 * Synthesizes an accurate, contextual AI answer using Ollama and the retrieved RAG documents.
 */
export async function synthesizeRagAnswer(
  ollama: Ollama,
  model: string,
  query: string,
  items: RagSearchResultItem[]
): Promise<string> {
  if (items.length === 0) {
    return "No relevant screens or workflows were found in the knowledge base to answer this question.";
  }

  const context = items
    .map((item, idx) => {
      const header = `[Source ${idx + 1}: ${item.screenName || "Screen"} (${item.pattern || item.url || "N/A"}) - Type: ${item.screenType || "page"}]`;
      return `${header}\n${item.document}`;
    })
    .join("\n\n---\n\n");

  const prompt = `You are an expert AI knowledge assistant for this web application.
Answer the user's question clearly, step-by-step, and concisely based ONLY on the following application screens and workflows context.
Always cite the relevant screen names and route URLs where the user can accomplish their task.
If the context does not contain enough information, explain what is available and clarify what was not found in the scanned knowledge base.

Context from Knowledge Base:
${context}

User Question:
${query}

Answer:`;

  try {
    const answer = await chatText(ollama, {
      model,
      messages: [{ role: "user", content: prompt }],
      options: {
        temperature: 0.2
      }
    });

    return answer.trim();
  } catch (err) {
    return `Retrieved ${items.length} relevant screen(s), but could not generate AI synthesis answer: ${(err as Error).message}`;
  }
}
