import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { createDatabasePool, safeDatabaseError } from "../server/database/connection.js";
import { verifySchema } from "../server/database/migrations.js";
import { importJson } from "../server/database/import-json.js";

try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw new Error("Configuração local inválida."); }
let pool;
try {
  if (!process.argv[2]) throw new Error("Informe o diretório da origem e mantenha o servidor JSON parado.");
  pool = createDatabasePool();
  await verifySchema(pool);
  const result = await importJson(pool, resolve(process.argv[2]));
  console.info(JSON.stringify(result));
} catch (error) {
  console.error("Importação recusada; originais preservados. Confira estrutura, referências e destino vazio:", safeDatabaseError(error));
  process.exitCode = 1;
} finally { await pool?.end(); }
