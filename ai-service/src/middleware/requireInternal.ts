import type { NextFunction, Request, Response } from "express";

export function requireInternal(req: Request, res: Response, next: NextFunction): void {
    const expected = process.env.INTERNAL_API_TOKEN || "";
    if (!expected || req.header("x-internal-token") !== expected) {
        res.status(401).json({ detail: "Invalid internal token" });
        return;
    }
    next();
}
