import path from "node:path";
import { Ollama } from "ollama";
import type {
  IndexKnowledgeOptions,
  IndexKnowledgeResult
} from "../../types.js";
import { buildKnowledgeChunks } from "../chunkKnowledge/buildKnowledgeChunks.js";
import { getChromaClient } from "../chromaClient/chromaClient.js";
import { sanitizeCollectionName } from "../chromaClient/sanitizeCollectionName.js";
import { resolveKnowledge } from "./resolveKnowledge.js";


/**
 * Indexes the contents of knowledge.json into a ChromaDB collection using Ollama's nomic-embed-text.
 */
export async function indexKnowledgeToChroma(
  options: IndexKnowledgeOptions
): Promise<IndexKnowledgeResult> {
  const { knowledge, runDir } = await resolveKnowledge(options);

  // 1. Determine dynamic collection name
  let rawCollectionName = options.collectionName;
  if (!rawCollectionName) {
    if (runDir) {
      rawCollectionName = path.basename(runDir);
    } else {
      try {
        const u = new URL(knowledge.startUrl);
        rawCollectionName = `${u.hostname.replace(/[^a-zA-Z0-9]/g, "_")}_kb`;
      } catch {
        rawCollectionName = "website_knowledge_base";
      }
    }
  }

  const collectionName = sanitizeCollectionName(rawCollectionName);

  // 2. Set up Ollama Client & Embedding Model
  const ollamaUrl = (options.ollamaUrl ?? process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const embedModel = options.embedModel ?? process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
  const ollama = options.ollamaClient ?? new Ollama({ host: ollamaUrl });

  // 3. Prepare Knowledge Chunks
  const chunks = buildKnowledgeChunks(knowledge);
  if (chunks.length === 0) {
    throw new Error("No screen knowledge chunks found to index.");
  }

  // 4. Generate Embeddings using nomic-embed-text
  const texts = chunks.map((c) => c.document);
  const embeddings = await generateEmbeddings(ollama, texts, embedModel);

  // 5. Connect to ChromaDB & Upsert
  const chroma = options.chromaClient ?? getChromaClient(options);
  const collection = await chroma.getOrCreateCollection({
    name: collectionName,
    metadata: {
      description: `RAG Knowledge Base for ${knowledge.startUrl}`,
      generatedAt: new Date().toISOString(),
      embedModel,
      startUrl: knowledge.startUrl,
      totalScreens: knowledge.screens.length
    }
  });

  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const chunkBatch = chunks.slice(i, i + batchSize);
    const embeddingBatch = embeddings.slice(i, i + batchSize);

    await collection.upsert({
      ids: chunkBatch.map((c) => c.id),
      embeddings: embeddingBatch,
      metadatas: chunkBatch.map((c) => c.metadata),
      documents: chunkBatch.map((c) => c.document)
    });
  }

  return {
    collectionName,
    databaseName: options.databaseName || options.chromaDatabase,
    totalChunks: chunks.length,
    screensCount: knowledge.screens.length,
    embedModel,
    indexedAt: new Date().toISOString()
  };
}

/**
 * Generates vector embeddings for a list of texts using Ollama's embed API
 * in batches to avoid network or context timeouts.
 */
export async function generateEmbeddings(
  ollama: Ollama,
  texts: string[],
  model: string = "nomic-embed-text",
  batchSize: number = 20
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const response = await ollama.embed({
        model,
        input: batch
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("Ollama returned empty embeddings.");
      }

      allEmbeddings.push(...response.embeddings);
    } catch (err) {
      throw new Error(
        `Failed to generate embeddings with Ollama model "${model}": ${(err as Error).message}. Run: ollama pull ${model}`
      );
    }
  }

  return allEmbeddings;
}
