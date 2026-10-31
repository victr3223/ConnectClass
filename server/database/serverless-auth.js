import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { transaction } from "./connection.js";

const digest = value => createHash("sha256").update(value).digest("hex");
const validToken = token => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export async function initializeServerlessSchema(connection) {
  const sql = (await readFile(new URL("../../database/serverless.sql", import.meta.url), "utf8")).replace(/^--.*$/gm, "");
  for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await connection.query(statement);
  await verifyServerlessSchema(connection);
}

export async function verifyServerlessSchema(pool) {
  await pool.execute("SELECT token_hash, user_id, expires_at FROM web_sessions LIMIT 0");
  await pool.execute("SELECT bucket_hash, attempts, expires_at FROM auth_attempts LIMIT 0");
}

export function createMysqlSessionStore(pool, { regularTtlMs, rememberedTtlMs }) {
  return {
    async create(userId, rememberMe) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + (rememberMe ? rememberedTtlMs : regularTtlMs);
      await pool.execute("DELETE FROM web_sessions WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 100");
      await pool.execute("INSERT INTO web_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        [digest(token), userId, new Date(expiresAt)]);
      return { token, expiresAt };
    },
    async get(token) {
      if (!validToken(token)) return null;
      const [rows] = await pool.execute(
        "SELECT user_id AS userId, expires_at AS expiresAt FROM web_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3)", [digest(token)]);
      return rows[0] ?? null;
    },
    async destroy(token) {
      if (validToken(token)) await pool.execute("DELETE FROM web_sessions WHERE token_hash = ?", [digest(token)]);
    },
  };
}

export function createMysqlAuthLimiter(pool, { limit, windowMs }) {
  return {
    async consume(address) {
      const bucket = digest(address);
      return transaction(pool, async connection => {
        await connection.execute("INSERT INTO auth_attempts (bucket_hash, attempts, expires_at) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE bucket_hash = ?",
          [bucket, new Date(Date.now() + windowMs), bucket]);
        const [[entry]] = await connection.execute(
          "SELECT attempts, expires_at, expires_at <= UTC_TIMESTAMP(3) AS expired FROM auth_attempts WHERE bucket_hash = ? FOR UPDATE", [bucket]);
        const count = entry.expired ? 0 : entry.attempts;
        if (count >= limit) return false;
        await connection.execute("UPDATE auth_attempts SET attempts = ?, expires_at = ? WHERE bucket_hash = ?",
          [count + 1, entry.expired ? new Date(Date.now() + windowMs) : entry.expires_at, bucket]);
        return true;
      });
    },
  };
}
