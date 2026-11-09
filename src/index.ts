import "dotenv/config";
import { parseOptions } from "./config.js";
import { checkBrowserInstalled } from "./browser/checkBrowserInstalled.js";
import { crawl } from "./crawler/crawl/crawler.js";

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;

  try {
    await checkBrowserInstalled();
  } catch (error) {
    console.error("\nCould not run agent-browser.");
    console.error("Try: npm install && npx agent-browser install");
    throw error;
  }


  await crawl(options);
}

main().catch((error: unknown) => {
  console.error(`\nFatal error: ${(error as Error).message}`);
  process.exitCode = 1;
});
