import type { Provider } from "./types";

export const GEMINI_MAIN_MODELS = [
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
] as const;
export const GEMINI_MID_MODELS = GEMINI_MAIN_MODELS;
export const GEMINI_LOW_MODELS = GEMINI_MAIN_MODELS;

export const DEFAULT_MAIN_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_TITLE_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_TABULAR_MODEL = "gemini-3.1-flash-lite-preview";
export const FALLBACK_MODEL = "gemini-3-flash-preview";

const ALL_MODELS = new Set<string>([
    ...GEMINI_MAIN_MODELS,
    ...GEMINI_MID_MODELS,
    ...GEMINI_LOW_MODELS,
]);

export function providerForModel(_model: string): Provider {
    return "gemini";
}

export function resolveModel(id: string | null | undefined, fallback: string): string {
    if (id && ALL_MODELS.has(id)) return id;
    return fallback;
}
