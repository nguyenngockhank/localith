import type { CrawledPage } from "../../types.js";
import { relativeReportPath } from "../../utils.js";
import { CreateSuccessPageParams } from "./crawler.js";

/**
 * Creates a CrawledPage entry for a successfully crawled page.
 */
export function createSuccessPage(params: CreateSuccessPageParams): CrawledPage {
    const {
        url, finalUrl, depth, extraction, runDir, snapshotPath, dataPath, authWall, authHandled, pattern, crawledAt
    } = params;

    return {
        url,
        finalUrl,
        depth,
        status: "ok",
        title: extraction.title,
        description: extraction.description,
        canonical: extraction.canonical,
        headings: extraction.headings,
        links: extraction.links,
        linksFound: extraction.links.length,
        text: extraction.text,
        snapshotFile: relativeReportPath(runDir, snapshotPath),
        dataFile: relativeReportPath(runDir, dataPath),
        authWall,
        ...(authHandled ? { authHandled: true } : {}),
        ...(pattern ? { pattern } : {}),
        crawledAt
    };
}
