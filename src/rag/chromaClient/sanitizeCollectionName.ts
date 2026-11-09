/**
 * Sanitizes a string into a valid ChromaDB collection name:
 * - 3 to 63 characters
 * - Only alphanumeric, underscores, and hyphens
 * - Starts and ends with an alphanumeric character
 */

export function sanitizeCollectionName(name?: string): string {
    if (!name || typeof name !== "string") {
        return "app_knowledge_base";
    }

    // Replace any characters not matching [a-zA-Z0-9_-] with "_"
    let cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");

    // Collapse consecutive underscores
    cleaned = cleaned.replace(/_+/g, "_");

    // Remove leading/trailing non-alphanumeric chars
    cleaned = cleaned.replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, "");

    // If too short, append suffix
    if (cleaned.length < 3) {
        cleaned = (cleaned + "_rag_kb").replace(/^[^a-z0-9]+/, "");
    }

    // If too long, truncate
    if (cleaned.length > 63) {
        cleaned = cleaned.slice(0, 63).replace(/[^a-z0-9]+$/, "");
    }

    return cleaned || "app_knowledge_base";
}
