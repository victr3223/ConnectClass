import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createDatabasePool, databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { verifySchema } from "../server/database/migrations.js";
import { replaceManager } from "../server/replace-manager.js";

export async function runReplacement(env = process.env) {
  const values = {newEmail:env.NEW_MANAGER_EMAIL, newPassword:env.NEW_MANAGER_PASSWORD, oldEmail:env.OLD_MANAGER_EMAIL,
    oldPassword:env.OLD_MANAGER_PASSWORD || env.CONNECTCLASS_GESTOR_PASSWORD};
  for (const name of ["NEW_MANAGER_EMAIL","NEW_MANAGER_PASSWORD","OLD_MANAGER_EMAIL","OLD_MANAGER_PASSWORD"]) delete env[name];
  if (env.DB_HOST !== "mysql" || env.DB_NAME !== "connectclass") throw new Error("Execute dentro do app do Compose atual; banco incorreto recusado.");
  const pool = createDatabasePool(databaseConfig(env));
  try {
    await verifySchema(pool);
    return await replaceManager({pool,...values,baseUrl:`http://127.0.0.1:${env.PORT || 8081}`});
  } finally { values.newPassword = undefined; values.oldPassword = undefined; await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--stdin-env")) {
      // Private stdin, never a command-line password, file, log or Docker container setting.
      let input = "";
      for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw new Error("Entrada inválida."); }
      const data = JSON.parse(input);
      for (const name of ["NEW_MANAGER_EMAIL","NEW_MANAGER_PASSWORD","OLD_MANAGER_EMAIL","OLD_MANAGER_PASSWORD"]) {
        if (typeof data[name] === "string") process.env[name] = data[name];
      }
      input = "";
    }
    const result = await runReplacement();
    console.info(JSON.stringify(result));
  } catch (error) {
    // No stack, SQL, bound parameters, account details or secret values.
    console.error("Troca não concluída; confira configuração e estado das contas localmente.", safeDatabaseError(error).code);
    process.exitCode = 1;
  }
}
