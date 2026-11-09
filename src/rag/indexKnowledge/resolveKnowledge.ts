import fs from "node:fs";
import path from "path";
import type { IndexKnowledgeOptions, CrawlKnowledgeResult } from "../../types.js";
import { readJsonFile } from "../../utils.js";
import { findLatestKnowledgeRunDir } from "./findLatestKnowledgeRunDir.js";

/**
 * Resolves the CrawlKnowledgeResult from provided options or disk.
 */

export async function resolveKnowledge(options: IndexKnowledgeOptions): Promise<{
    knowledge: CrawlKnowledgeResult;
    runDir?: string;
}> {
    if (options.knowledge) {
        return { knowledge: options.knowledge, runDir: options.runDir };
    }

    let knowledgePath = options.knowledgePath;
    let runDir = options.runDir;

    if (!knowledgePath && runDir) {
        knowledgePath = path.join(runDir, "knowledge.json");
    }

    if (!knowledgePath && options.reportPath) {
        const candidateDir = path.dirname(options.reportPath);
        const candidateKnowledge = path.join(candidateDir, "knowledge.json");
        if (fs.existsSync(candidateKnowledge)) {
            knowledgePath = candidateKnowledge;
            runDir = candidateDir;
        }
    }

    if (!knowledgePath) {
        const latest = findLatestKnowledgeRunDir();
        if (latest) {
            knowledgePath = path.join(latest, "knowledge.json");
            runDir = latest;
        }
    }

    if (!knowledgePath || !fs.existsSync(knowledgePath)) {
        throw new Error(
            `knowledge.json file not found. Run a scan with AI or execute: npm run analyze`
        );
    }

    const knowledge = await readJsonFile<CrawlKnowledgeResult>(knowledgePath);
    return { knowledge, runDir };
}
