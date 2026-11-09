import path from "node:path";
import "dotenv/config";
import { indexKnowledgeToChroma } from "./indexKnowledge/indexKnowledge.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let collectionName: string | undefined;
  let embedModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  let targetPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if ((arg === "--collection" || arg === "-c") && i + 1 < args.length) {
      collectionName = args[++i];
    } else if (arg === "--embed-model" && i + 1 < args.length) {
      embedModel = args[++i]!;
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  console.log(`\n📚 ChromaDB Knowledge Indexer`);
  console.log(`   Embedding Model: ${embedModel}`);
  if (collectionName) {
    console.log(`   Target Collection: ${collectionName}`);
  }
  if (targetPath) {
    console.log(`   Source Path: ${targetPath}`);
  }

  const result = await indexKnowledgeToChroma({
    collectionName,
    runDir: targetPath?.endsWith(".json") ? undefined : targetPath,
    knowledgePath: targetPath?.endsWith(".json") ? targetPath : undefined,
    embedModel
  });

  console.log(`\n✅ Knowledge successfully indexed into ChromaDB!`);
  console.log(`   Collection Name: ${result.collectionName}`);
  console.log(`   Total Chunks Indexed: ${result.totalChunks} (across ${result.screensCount} screens)`);
  console.log(`   Embedding Model: ${result.embedModel}`);
  console.log(`   Timestamp: ${result.indexedAt}\n`);
}

main().catch((err: unknown) => {
  console.error(`\n❌ Indexing failed: ${(err as Error).message}`);
  process.exitCode = 1;
});

