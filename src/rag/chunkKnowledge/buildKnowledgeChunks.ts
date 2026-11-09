import type { CrawlKnowledgeResult, KnowledgeChunk } from "../../types.js";
import { buildScreenChunk } from "./buildScreenChunk.js";
import { buildSiteOverviewChunk } from "./buildSiteOverviewChunk.js";
import { buildWorkflowChunks } from "./buildWorkflowChunks.js";


/**
 * Takes a full CrawlKnowledgeResult and transforms it into an array of structured,
 * semantically rich KnowledgeChunks ready for vector embedding in ChromaDB.
 */
export function buildKnowledgeChunks(knowledge: CrawlKnowledgeResult): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  // 1. Global site overview
  chunks.push(buildSiteOverviewChunk(knowledge));

  // 2. Individual screens and their respective workflows
  for (const screen of knowledge.screens) {
    chunks.push(buildScreenChunk(screen, knowledge.startUrl));
    chunks.push(...buildWorkflowChunks(screen));
  }

  return chunks;
}


