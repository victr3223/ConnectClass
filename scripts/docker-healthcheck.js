import mysql from "mysql2/promise";
import { databaseConfig } from "../server/database/connection.js";
import { verifySchema } from "../server/database/migrations.js";
let connection;
try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 8081}/health`, { signal: AbortSignal.timeout(2000) });
  if (!response.ok || (await response.json()).status !== "ok") throw new Error("HTTP indisponível.");
  connection = await mysql.createConnection(databaseConfig());
  await verifySchema(connection);
} catch { process.exitCode = 1; }
finally { await connection?.end(); }
