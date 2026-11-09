import { writeFile } from "fs/promises";
import fs from "node:fs";
import path from "path";
import type { ScreenKnowledge, CrawlKnowledgeResult } from "../types.js";
import { writeJson } from "../utils.js";
import { buildKnowledgeMarkdown } from "./buildKnowledgeMarkdown.js";

/**
 * Persists intermediate screen knowledge after Ollama processes each screen:
 * 1. Writes individual screen artifact (screens/screen-001.json)
 * 2. Updates cumulative knowledge.json
 * 3. Updates cumulative knowledge.md
 */

export async function persistScreenKnowledgeState(
    runDir: string,
    screen: ScreenKnowledge,
    currentResult: CrawlKnowledgeResult
): Promise<void> {
    const screensDir = path.join(runDir, "screens");
    if (!fs.existsSync(screensDir)) {
        await fs.promises.mkdir(screensDir, { recursive: true });
    }

    // 1. Write individual screen artifact file
    await writeJson(path.join(screensDir, `${screen.screenId}.json`), screen);

    // 2. Write cumulative knowledge.json
    await writeJson(path.join(runDir, "knowledge.json"), currentResult);

    // 3. Write cumulative knowledge.md
    await writeFile(
        path.join(runDir, "knowledge.md"),
        buildKnowledgeMarkdown(currentResult, runDir),
        "utf8"
    );
}
