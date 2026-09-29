// Only for the disposable GitHub Actions MySQL service, never the local/production server.
import mysql from "mysql2/promise";
import { databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { initializeSchema } from "../server/database/migrations.js";

let connection;
try {
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" || process.env.DB_NAME !== "connectclass_test" || !process.env.CI_DB_PASSWORD) {
    throw new Error("Provisionamento permitido somente no serviço descartável de CI.");
  }
  const { database: ignored, ...config } = databaseConfig(process.env, { admin: true });
  connection = await mysql.createConnection(config);
  await initializeSchema(connection, "connectclass");
  await initializeSchema(connection, "connectclass_test");
  // '%' is needed only for the container bridge in this disposable CI service.
  await connection.query("CREATE USER 'connectclass_test'@'%' IDENTIFIED BY ?", [process.env.CI_DB_PASSWORD]);
  await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON connectclass_test.* TO 'connectclass_test'@'%'");
  console.info("Schema de CI pronto; conta de testes restrita a DML no banco isolado.");
} catch (error) { console.error("Falha no provisionamento de CI:", safeDatabaseError(error)); process.exitCode = 1; }
finally { await connection?.end(); }
