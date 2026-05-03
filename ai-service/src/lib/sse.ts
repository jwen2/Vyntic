import type { Response } from "express";

export function sse(type: string, payload: Record<string, unknown> = {}): string {
    return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

export const DONE = "data: [DONE]\n\n";

export function setupSse(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
}
