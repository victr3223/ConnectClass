// Disposable GitHub Actions service ONLY; never a production migration command.
import mysql from "mysql2/promise";
import { databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { initializeSchema } from "../server/database/migrations.js";

let connection;
try {
  const config = databaseConfig(process.env, { admin: true });
  if (process.env.CI !== "true" || config.host !== "127.0.0.1" || config.database !== "connectclass_final_test" || !process.env.CI_DB_PASSWORD) {
    throw new Error("Somente serviço descartável de CI.");
  }
  const { database: unused, ...adminConfig } = config;
  connection = await mysql.createConnection(adminConfig);
  for (const database of ["connectclass_final", "connectclass_final_test"]) {
    await initializeSchema(connection, database, { createDatabase: true });
  }
  await connection.query("CREATE USER 'connectclass_final_test'@'%' IDENTIFIED BY ?", [process.env.CI_DB_PASSWORD]);
  await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON connectclass_final_test.* TO 'connectclass_final_test'@'%'");
  console.info("Schemas isolados e conta DML de CI preparados.");
} catch (error) {
  console.error("Falha na preparação de CI:", safeDatabaseError(error)); process.exitCode = 1;
} finally { await connection?.end(); }
