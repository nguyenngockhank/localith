import type { CrawlReport } from "../../types.js";
import { BuildCrawlReportParams, computeCrawlTotals } from "./crawler.js";
import { computePatternGroups } from "./urlPattern.js";

/**
 * Assembles the final CrawlReport object.
 */
export function buildCrawlReport(params: BuildCrawlReportParams): CrawlReport {
    const {
        options,
        pages,
        startedAt,
        finishedAt,
        effectiveDelay,
        discoveredCount,
        visitedCount,
        skippedByRobots,
        skippedByAuth,
        skippedByPattern
    } = params;

    return {
        startUrl: options.startUrl,
        startedAt,
        finishedAt,
        settings: {
            maxDepth: options.maxDepth,
            maxPages: options.maxPages,
            maxPagesPerPattern: options.maxPagesPerPattern ?? 3,
            delayMs: effectiveDelay,
            includeSubdomains: options.includeSubdomains,
            respectRobots: options.respectRobots,
            auth: { enabled: options.auth.enabled },
            generateKnowledge: options.generateKnowledge ?? false,
            ollamaModel: options.ollamaModel
        },
        totals: computeCrawlTotals(
            pages,
            discoveredCount,
            visitedCount,
            skippedByRobots,
            skippedByAuth,
            skippedByPattern
        ),
        pages,
        patternGroups: computePatternGroups(pages)
    };
}
