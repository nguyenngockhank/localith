import { Ollama } from "ollama";

export interface GetOllamaClientOptions {
    ollamaUrl?: string;
    ollamaClient?: Ollama;
    ollamaModel?: string
}

export function getOllamaClient(options?: GetOllamaClientOptions) {
    const ollamaUrl = (options?.ollamaUrl ?? process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    const ollamaClient = options?.ollamaClient ?? new Ollama({ host: ollamaUrl });
    const ollamaModel = options?.ollamaModel ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
    return { ollamaClient, ollamaModel };
}