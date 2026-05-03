import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_PATH || "./data/ai-service.db";
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schemaPath = [
    path.join(process.cwd(), "src/db/schema.sql"),
    path.join(__dirname, "../db/schema.sql"),
].find((candidate) => fs.existsSync(candidate));
if (!schemaPath) {
    throw new Error("Could not find ai-service schema.sql");
}
const schema = fs.readFileSync(schemaPath, "utf8");
db.exec(schema);

export function nowIso(): string {
    return new Date().toISOString();
}
