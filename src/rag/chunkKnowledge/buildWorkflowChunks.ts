import type { ScreenKnowledge, KnowledgeChunk } from "../../types.js";

/**
 * Builds specific action/workflow chunks for a screen.
 * Highly effective for matching user intent questions like "how can I create a report?" or "how do I reset password?".
 */

export function buildWorkflowChunks(screen: ScreenKnowledge): KnowledgeChunk[] {
    const chunks: KnowledgeChunk[] = [];

    for (let i = 0; i < screen.keyWorkflows.length; i++) {
        const wf = screen.keyWorkflows[i]!;
        const otherWorkflows = screen.keyWorkflows.filter((w) => w !== wf);

        const lines: string[] = [
            `Screen: ${screen.screenName} (${screen.pattern})`,
            `Screen Type: ${screen.screenType}`,
            `Action / Workflow: ${wf}`,
            `How it works: ${screen.summary}`,
            `Screen Purpose: ${screen.purpose}`
        ];

        if (screen.uiComponents.length > 0) {
            lines.push(`Related UI Components: ${screen.uiComponents.join(", ")}`);
        }

        if (otherWorkflows.length > 0) {
            lines.push(`Other Actions on this Screen:\n${otherWorkflows.slice(0, 5).map((w) => `- ${w}`).join("\n")}`);
        }

        chunks.push({
            id: `${screen.screenId}-wf-${i + 1}`,
            document: lines.join("\n\n"),
            metadata: {
                screenId: screen.screenId,
                screenName: screen.screenName,
                screenType: screen.screenType,
                pattern: screen.pattern,
                chunkType: "workflow",
                workflowIndex: i + 1,
                workflow: wf.slice(0, 500),
                url: screen.sampleUrls[0] || screen.pattern
            }
        });
    }

    return chunks;
}
