import { runAgentBrowser } from "./runAgentBrowser.js";

interface LoginResult {
    filled: boolean;
    submitted: boolean;
    success: boolean;
    reason?: string;
}

export async function attemptLogin(
    email: string,
    password: string
): Promise<LoginResult> {
    try {
        const snapshot = await runAgentBrowser(
            ["snapshot", "-i"],
            30000
        );

        const emailSelector =
            'input[autocomplete="username"], input[type="email"], input[name="email"], input[name="username"], input[id="email"], input[id="username"], input[data-path="email"]';

        const passwordSelector =
            'input[type="password"], input[name="password"], input[id="password"]';

        // Fill email
        await runAgentBrowser([
            "fill",
            emailSelector,
            email
        ], 30000);

        // Fill password
        await runAgentBrowser([
            "fill",
            passwordSelector,
            password
        ], 30000);

        const result: LoginResult = {
            filled: true,
            submitted: false,
            success: false
        };

        // Submit
        await runAgentBrowser([
            "press",
            "Enter"
        ], 60000);

        // Command chạy thành công => đã thực hiện submit action
        result.submitted = true;

        // Chờ UI cập nhật
        await runAgentBrowser([
            "wait",
            "2000"
        ], 10000);

        return result;

    } catch (error) {
        return {
            filled: false,
            submitted: false,
            success: false,
            reason: error instanceof Error
                ? error.message
                : String(error)
        };
    }
}
