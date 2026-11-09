import type { PageExtraction } from "../types.js";

const AUTH_WALL_KEYWORDS = /sign ?in|log ?in|log ?on|sign ?on|signon|create an? account|register|access denied|unauthorized|please (sign|log) ?in|enter your (email|password)|enter password|email address/i;
export function detectAuthWall(extraction: PageExtraction, finalUrl: string): boolean {
    const text = [
        extraction.title ?? "",
        extraction.description ?? "",
        ...extraction.headings.map((h) => h.text),
        extraction.text ?? ""
    ].join(" ");
    const hasKeywords = AUTH_WALL_KEYWORDS.test(text);
    const hasPasswordField = (extraction.passwordFields ?? 0) > 0;
    return looksLikeLoginUrl(finalUrl) || (hasPasswordField && hasKeywords);
}

function looksLikeLoginUrl(url: string): boolean {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        return /(^|\/)(login|sign ?in|signin|auth|sign ?on|signon|register|sign ?up|signup)(\/|$)/i.test(pathname);
    } catch {
        return false;
    }
}
