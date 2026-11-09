import path from "path";
import { createHash } from "node:crypto";

export function createRunDirectory(startUrl: string): string {
    return path.join(
        process.cwd(),
        "reports",
        `${safeSlug(startUrl)}`
    );
}

export function safeSlug(value: string): string {
    const host = new URL(value).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const hash = createHash("sha1").update(value).digest("hex").slice(0, 8);
    return `${host || "website"}-${hash}`;
}

function timestampSlug(date = new Date()): string {
    return date.toISOString().replace(/[:.]/g, "-");
}
