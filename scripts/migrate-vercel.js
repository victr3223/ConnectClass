import mysql from "mysql2/promise";
import { databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { initializeSchema, verifySchema } from "../server/database/migrations.js";
import { initializeServerlessSchema } from "../server/database/serverless-auth.js";

let connection, locked = false;
try {
  // Run explicitly with migration credentials. Never import or load a local .env implicitly.
  const config = databaseConfig();
  if (process.env.DB_SSL !== "true") throw new Error("A migração externa exige TLS.");
  connection = await mysql.createConnection(config);
  const [[lock]] = await connection.execute("SELECT GET_LOCK(CONCAT(DATABASE(), ':schema'), 30) AS acquired");
  if (lock.acquired !== 1) throw new Error("Migração ocupada.");
  locked = true;
  try { await verifySchema(connection); }
  catch (error) { if (error.code !== "ER_NO_SUCH_TABLE") throw error; }
  await initializeSchema(connection, config.database);
  await initializeServerlessSchema(connection);
  await verifySchema(connection);
  console.info("Migração aditiva concluída. Dados existentes preservados.");
} catch (error) {
  console.error("Migração Vercel recusada:", safeDatabaseError(error));
  process.exitCode = 1;
} finally {
  if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':schema'))").catch(() => {});
  await connection?.end();
}
