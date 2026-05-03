import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthedRequest = Request & {
    userId: string;
    userEmail?: string;
};

type PythonJwtPayload = jwt.JwtPayload & {
    sub?: string;
    email?: string;
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const auth = req.header("authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) {
        res.status(401).json({ detail: "Not authenticated" });
        return;
    }

    try {
        const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || "";
        const payload = jwt.verify(token, secret, {
            algorithms: ["HS256"],
        }) as PythonJwtPayload;
        if (!payload.sub) {
            res.status(401).json({ detail: "Invalid token payload" });
            return;
        }
        (req as AuthedRequest).userId = String(payload.sub);
        (req as AuthedRequest).userEmail = payload.email;
        next();
    } catch {
        res.status(401).json({ detail: "Invalid or expired token" });
    }
}
