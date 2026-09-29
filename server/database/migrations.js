import { readFile } from "node:fs/promises";
import { validDatabaseName } from "./connection.js";

export async function initializeSchema(connection, database, { createDatabase = false } = {}) {
  if (!validDatabaseName(database)) throw new Error("Nome de banco inválido.");
  // Identifiers cannot be prepared parameters: validate before quoting. No user input here.
  if (createDatabase) await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci`);
  await connection.query(`USE \`${database}\``);
  const sql = (await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"))
    .replace(/^--.*$/gm, "");
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) await connection.query(statement);
}

export async function verifySchema(pool) {
  const [versions] = await pool.execute("SELECT version FROM schema_migrations ORDER BY version");
  if (versions.length !== 1 || versions[0].version !== 1) throw new Error("Schema incompatível. Execute db:init com a configuração de migração.");
  await pool.execute("SELECT id, senha_hash, created_at FROM users LIMIT 0");
  await pool.execute("SELECT id, usuario_id, status, last_activity_at FROM conversations LIMIT 0");
  await pool.execute("SELECT id, conversation_id, sender_id, legacy_reply_id FROM messages LIMIT 0");
}
