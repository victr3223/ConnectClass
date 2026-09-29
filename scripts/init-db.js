import mysql from "mysql2/promise";
import { databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { initializeSchema } from "../server/database/migrations.js";

let connection;
try {
  const database = process.env.DB_NAME;
  const { database: ignored, ...config } = databaseConfig(process.env, { admin: true });
  connection = await mysql.createConnection(config);
  await initializeSchema(connection, database);
  console.info("Schema inicializado. Nenhum dado existente foi removido.");
} catch (error) { console.error("Falha ao inicializar schema:", safeDatabaseError(error)); process.exitCode = 1; }
finally { await connection?.end(); }
