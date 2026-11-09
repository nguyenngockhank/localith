import type { ScreenKnowledge } from "../types.js";
import { ScreenGroup, deriveDefaultName } from "./generateScreenKnowledge.js";

export function createFallbackScreenAnalysis(
    group: ScreenGroup,
    title: string): Omit<ScreenKnowledge, "screenId" | "pattern" | "isPatternGroup" | "sampleUrls"> {
    const name = title || deriveDefaultName(group);
    return {
        screenName: name,
        screenType: group.isPatternGroup ? "detail-view" : "page",
        summary: `Screen representing ${group.pattern}.`,
        purpose: "Application screen interface.",
        keyWorkflows: ["View screen information"],
        dataEntities: [],
        uiComponents: [],
        keywords: group.pattern.split(/[/_-]/).filter((w) => w.length > 3 && !w.startsWith("http")),
        isFallback: true
    };
}
