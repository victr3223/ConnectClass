// Explicit one-time local provisioning, never run by npm start or tests.
import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { initializeSchema } from "../server/database/migrations.js";

let connection;
try {
  const config = databaseConfig(process.env, { admin: true });
  if (!["localhost", "127.0.0.1", "::1"].includes(config.host)) throw new Error("Somente provisionamento local.");
  for (const file of [".env", ".env.test"]) {
    let exists = true; try { await access(file); } catch (e) { if (e.code === "ENOENT") exists = false; else throw e; }
    if (exists) throw new Error("Configuração existente: não sobrescrever.");
  }
  connection = await mysql.createConnection(config);
  const [schemas] = await connection.execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?, ?)", ["connectclass_final", "connectclass_final_test"]);
  if (schemas.length) throw new Error("Banco já existe: não provisionar por cima de dados existentes.");
  const [existing] = await connection.execute("SELECT user FROM mysql.user WHERE user IN (?, ?)", ["connectclass_final_app", "connectclass_final_test"]);
  if (existing.length) throw new Error("Conta já existe: não redefinir credenciais.");
  for (const [database, user, file] of [["connectclass_final", "connectclass_final_app", ".env"], ["connectclass_final_test", "connectclass_final_test", ".env.test"]]) {
    await initializeSchema(connection, database, { createDatabase: true });
    const secret = randomBytes(32).toString("base64url");
    // Account-management DDL doesn't accept prepared markers for all grammar positions.
    // mysql2.query placeholders escape values, and identifiers here come ONLY from the fixed list above.
    await connection.query("CREATE USER ?@'localhost' IDENTIFIED BY ?", [user, secret]);
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.* TO ?@'localhost'`, [user]);
    const body = `DB_HOST=127.0.0.1\nDB_PORT=${config.port}\nDB_USER=${user}\nDB_PASSWORD=${secret}\nDB_NAME=${database}\nHOST=127.0.0.1\nPORT=8081\nNODE_ENV=development\n`;
    await writeFile(file, body, { flag: "wx", mode: 0o600 });
  }
  console.info("Bancos e contas locais preparados; configurações privadas gravadas sem exibir credenciais.");
} catch (error) { console.error("Provisionamento interrompido; preserve qualquer recurso já criado:", safeDatabaseError(error)); process.exitCode = 1; }
finally { await connection?.end(); }
