import "dotenv/config";
import { searchRag } from "./searchRag.js";
import { getChromaClient } from "./chromaClient/chromaClient.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let query: string | undefined;
  let collectionName: string | undefined;
  let nResults = 5;
  let generateAnswer = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if ((arg === "--collection" || arg === "-c") && i + 1 < args.length) {
      collectionName = args[++i];
    } else if (arg === "--limit" || arg === "-n") {
      nResults = parseInt(args[++i] || "5", 10);
    } else if (arg === "--no-answer") {
      generateAnswer = false;
    } else if (!arg.startsWith("-")) {
      query = arg;
    }
  }

  if (!query) {
    console.error("Usage: npm run rag:search -- \"<question>\" [--collection <name>]");
    console.error("Example: npm run rag:search -- \"how can I create a report?\"");
    process.exitCode = 1;
    return;
  }

  // If no collection specified, inspect ChromaDB for available collections
  if (!collectionName) {
    try {
      const chroma = getChromaClient();
      const collections = await chroma.listCollections();
      if (collections.length > 0) {
        collectionName = collections[0]!.name;
      }
    } catch {
      // Continue to default
    }
  }

  console.log(`\n🔎 Querying RAG Database:`);
  console.log(`   Question: "${query}"`);
  console.log(`   Collection: ${collectionName || "default"}`);

  const searchResult = await searchRag({
    query,
    collectionName,
    nResults,
    generateAnswer
  });

  if (searchResult.answer) {
    console.log(`\n🤖 AI Answer:`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(searchResult.answer);
    console.log(`--------------------------------------------------------------------------------`);
  }

  console.log(`\n📄 Retrieved Sources (${searchResult.resultsCount} chunks):`);
  searchResult.results.forEach((item, index) => {
    const scoreStr = item.score !== undefined ? ` (Match Score: ${(item.score * 100).toFixed(1)}%)` : "";
    console.log(`\n[${index + 1}] ${item.screenName || "Screen"} [${item.chunkType || "chunk"}]${scoreStr}`);
    console.log(`    Route: ${item.pattern || item.url || "N/A"}`);
    if (item.metadata?.workflow) {
      console.log(`    Workflow: ${item.metadata.workflow}`);
    }
    const snippet = item.document.split("\n").slice(0, 3).join("\n    ");
    console.log(`    Snippet:\n    ${snippet}...`);
  });

  console.log("");
}

main().catch((err: unknown) => {
  console.error(`\n❌ Search failed: ${(err as Error).message}`);
  process.exitCode = 1;
});

