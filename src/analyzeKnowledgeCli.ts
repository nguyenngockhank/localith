import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { generateCrawlKnowledge } from "./knowledge/generateScreenKnowledge.js";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const force = rawArgs.includes("--force") || rawArgs.includes("-f");
  const filteredArgs = rawArgs.filter((a) => a !== "--force" && a !== "-f");
  let runDir = filteredArgs[0];

  if (!runDir) {
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) {
      console.error("No reports directory found. Run a scan first with: npm run scan -- <url>");
      process.exitCode = 1;
      return;
    }

    const entries = fs.readdirSync(reportsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(reportsDir, d.name, "report.json")));

    if (entries.length === 0) {
      console.error("No crawl reports found in reports/. Run a scan first with: npm run scan -- <url>");
      process.exitCode = 1;
      return;
    }

    entries.sort((a, b) => {
      const aTime = fs.statSync(path.join(reportsDir, a.name, "report.json")).mtimeMs;
      const bTime = fs.statSync(path.join(reportsDir, b.name, "report.json")).mtimeMs;
      return bTime - aTime;
    });

    runDir = path.join(reportsDir, entries[0]!.name);
  }

  console.log(`\n🧠 AI Knowledge & Keywords Engine`);
  console.log(`   Target Report: ${runDir}`);
  if (force) {
    console.log(`   Mode: Force re-analysis (--force enabled)`);
  } else {
    console.log(`   Mode: Incremental (reuses previously saved screens)`);
  }

  const result = await generateCrawlKnowledge({ runDir, forceReanalyze: force });

  console.log(`\n✅ Knowledge generated successfully!`);
  console.log(`   Total Screens: ${result.totalScreens} (${result.totalPatternGroups} pattern groups)`);
  console.log(`   Global Keywords: ${result.globalKeywords.slice(0, 10).join(", ")}...`);
  console.log(`   Saved JSON: ${path.join(runDir, "knowledge.json")}`);
  console.log(`   Saved Markdown: ${path.join(runDir, "knowledge.md")}\n`);
}

main().catch((err: unknown) => {
  console.error(`\n❌ Error: ${(err as Error).message}`);
  process.exitCode = 1;
});

