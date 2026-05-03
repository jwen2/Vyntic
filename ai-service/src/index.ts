import "dotenv/config";
import cors from "cors";
import express from "express";
import { matrixRouter } from "./routes/matrix";
import "./lib/db";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "2mb" }));
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));

app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "vyntic-ai-service" });
});

app.use("/matrices", matrixRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[ai-service] unhandled error", err);
    res.status(500).json({ detail: "Internal server error" });
});

app.listen(port, () => {
    console.log(`[ai-service] listening on http://localhost:${port}`);
});
