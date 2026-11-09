import fs from "node:fs";
import path from "path";

/**
 * Finds the latest crawl run directory in reports/ that contains a knowledge.json file.
 */

export function findLatestKnowledgeRunDir(): string | null {
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) return null;

    const entries = fs.readdirSync(reportsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(reportsDir, d.name, "knowledge.json")));

    if (entries.length === 0) return null;

    entries.sort((a, b) => {
        const aTime = fs.statSync(path.join(reportsDir, a.name, "knowledge.json")).mtimeMs;
        const bTime = fs.statSync(path.join(reportsDir, b.name, "knowledge.json")).mtimeMs;
        return bTime - aTime;
    });

    return path.join(reportsDir, entries[0]!.name);
}
