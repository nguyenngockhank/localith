import { attemptLogin } from "../../browser/attemptLogin.js";
import { capturePage } from "../../browser/capturePage.js";
import type { CrawlOptions, PageExtraction } from "../../types.js";
import { sleep, normalizeUrl } from "../../utils.js";
import { detectAuthWall } from "../detectAuthWall.js";
import { AuthResolutionResult } from "./crawler.js";

// ---------------------------------------------------------------------------
// Browser & Session Helpers
// ---------------------------------------------------------------------------
export async function handleAuthWall(
    options: CrawlOptions,
    initialExtraction: PageExtraction,
    initialFinalUrl: string,
    initialSnapshot: string): Promise<AuthResolutionResult> {
    console.log("   🔐 Auth wall detected, attempting sign-in...");
    const login = await attemptLogin(options.auth.email!, options.auth.password!);
    const authHandled = login.submitted;

    let extraction = initialExtraction;
    let finalUrl = initialFinalUrl;
    let snapshot = initialSnapshot;
    let stillWall = true;

    // Give the post-login navigation time to complete, then re-capture.
    for (let retry = 0; retry < 3; retry += 1) {
        await sleep(2000);
        const recaptured = await capturePage(options.maxSnapshotChars, options.maxPageTextChars);
        const reFinalUrl = normalizeUrl(recaptured.finalUrl) ?? finalUrl;
        console.log(">> after auth", reFinalUrl);
        const reExtraction: PageExtraction = recaptured.extraction;
        if (!detectAuthWall(reExtraction, reFinalUrl)) {
            extraction = reExtraction;
            finalUrl = reFinalUrl;
            snapshot = recaptured.snapshot;
            stillWall = false;
            break;
        }
    }

    return {
        success: !stillWall,
        authHandled,
        extraction,
        finalUrl,
        snapshot
    };
}
