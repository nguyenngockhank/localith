import type { ScreenKnowledge, KnowledgeChunk } from "../../types.js";

/**
 * Builds a primary overview chunk for a screen.
 */

export function buildScreenChunk(screen: ScreenKnowledge, startUrl?: string): KnowledgeChunk {
    const lines: string[] = [
        `Screen: ${screen.screenName}`,
        `Screen Type: ${screen.screenType}`,
        `URL / Route Pattern: ${screen.pattern}`,
        screen.isPatternGroup ? "Pattern Template: Yes (parameterized screen group)" : "Pattern Template: No (static screen)",
        `Purpose: ${screen.purpose}`,
        `Summary: ${screen.summary}`
    ];

    if (screen.keyWorkflows.length > 0) {
        lines.push("Key Actions & Workflows:");
        for (const wf of screen.keyWorkflows) {
            lines.push(`- ${wf}`);
        }
    }

    if (screen.dataEntities.length > 0) {
        lines.push(`Data Entities & Models: ${screen.dataEntities.join(", ")}`);
    }

    if (screen.uiComponents.length > 0) {
        lines.push(`UI Components & Controls: ${screen.uiComponents.join(", ")}`);
    }

    if (screen.keywords.length > 0) {
        lines.push(`Keywords: ${screen.keywords.join(", ")}`);
    }

    if (screen.sampleUrls.length > 0) {
        lines.push(`Sample URLs: ${screen.sampleUrls.slice(0, 3).join(", ")}`);
    }

    return {
        id: `${screen.screenId}-overview`,
        document: lines.join("\n\n"),
        metadata: {
            screenId: screen.screenId,
            screenName: screen.screenName,
            screenType: screen.screenType,
            pattern: screen.pattern,
            isPatternGroup: screen.isPatternGroup ? "true" : "false",
            chunkType: "screen_overview",
            url: screen.sampleUrls[0] || screen.pattern,
            keywords: screen.keywords.slice(0, 15).join(", ")
        }
    };
}
