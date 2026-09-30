import mysql from "mysql2/promise";
import { setTimeout as sleep } from "node:timers/promises";
import { databaseConfig } from "./connection.js";
import { initializeSchema, verifySchema } from "./migrations.js";

export async function migrateDockerSchema({ env = process.env, connect = mysql.createConnection, wait = sleep, attempts = 30 } = {}) {
  if (!env.DB_MIGRATION_USER || !env.DB_MIGRATION_PASSWORD || env.DB_MIGRATION_USER === env.DB_USER) {
    throw new Error("Use credenciais separadas de migração.");
  }
  const config = databaseConfig({ ...env, DB_USER: env.DB_MIGRATION_USER, DB_PASSWORD: env.DB_MIGRATION_PASSWORD });
  const transient = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST", "ER_SERVER_SHUTDOWN"]);
  let connection;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { connection = await connect(config); break; }
    catch (error) { if (!transient.has(error.code) || attempt === attempts) throw error; await wait(2000); }
  }
  let locked = false;
  try {
    const [[lock]] = await connection.execute("SELECT GET_LOCK(CONCAT(DATABASE(), ':schema'), 60) AS acquired");
    if (lock.acquired !== 1) throw new Error("Migração ocupada. Nenhuma alteração aplicada.");
    locked = true;
    try {
      const [versions] = await connection.execute("SELECT version FROM schema_migrations ORDER BY version");
      if (versions.some(row => row.version !== 1)) throw new Error("Schema futuro/incompatível: não aplicar downgrade.");
    } catch (error) { if (error.code !== "ER_NO_SUCH_TABLE") throw error; }
    // Current schema v1 is additive and idempotent; no DROP, TRUNCATE or data resets.
    await initializeSchema(connection, config.database);
    await verifySchema(connection);
  } finally {
    if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':schema'))").catch(() => {});
    await connection.end();
  }
}
