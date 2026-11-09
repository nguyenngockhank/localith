import type { CrawlKnowledgeResult, KnowledgeChunk } from "../../types.js";

/**
 * Builds a global application overview chunk.
 */

export function buildSiteOverviewChunk(knowledge: CrawlKnowledgeResult): KnowledgeChunk {
    const screenList = knowledge.screens
        .map((s) => `- ${s.screenName} (${s.screenType}): ${s.pattern} — ${s.purpose}`)
        .slice(0, 50);

    const lines: string[] = [
        `Application Knowledge Base for: ${knowledge.startUrl}`,
        `Site Summary: ${knowledge.siteSummary}`,
        `Total Unique Screens: ${knowledge.totalScreens}`,
        `Dynamic Pattern Groups: ${knowledge.totalPatternGroups}`,
        `Global Domain Keywords: ${knowledge.globalKeywords.join(", ")}`
    ];

    if (screenList.length > 0) {
        lines.push(`Available Screens in Application:\n${screenList.join("\n")}`);
    }

    return {
        id: "global-site-overview",
        document: lines.join("\n\n"),
        metadata: {
            screenId: "global",
            screenName: "Application Overview",
            screenType: "site-summary",
            pattern: knowledge.startUrl,
            chunkType: "site_overview",
            url: knowledge.startUrl,
            keywords: knowledge.globalKeywords.slice(0, 15).join(", ")
        }
    };
}
