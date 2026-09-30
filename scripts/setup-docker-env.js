import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function createDockerEnvironment(directory = process.cwd()) {
  const appFile = resolve(directory, ".env.docker.app");
  const mysqlFile = resolve(directory, ".env.docker.mysql");
  for (const file of [appFile, mysqlFile]) {
    try { await access(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error("Configuração Docker já existe. Não sobrescrever nem redefinir credenciais.");
  }
  const secret = () => randomBytes(32).toString("base64url");
  const password = secret(), migrationPassword = secret();
  await writeFile(appFile, `DB_USER=connectclass_app\nDB_PASSWORD=${password}\nDB_MIGRATION_USER=connectclass_migrator\nDB_MIGRATION_PASSWORD=${migrationPassword}\nCONNECTCLASS_GESTOR_PASSWORD=${secret()}\n`, { flag: "wx", mode: 0o600 });
  await writeFile(mysqlFile, `MYSQL_USER=connectclass_app\nMYSQL_PASSWORD=${password}\nMYSQL_ROOT_PASSWORD=${secret()}\nDB_MIGRATION_PASSWORD=${migrationPassword}\n`, { flag: "wx", mode: 0o600 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await createDockerEnvironment(); console.info("Arquivos .env.docker.app/mysql criados privadamente; .env local preservado. Consulte a senha inicial do gestor no arquivo privado, sem publicá-la."); }
  catch { console.error("Configuração Docker não criada: confira arquivos existentes/permissões. Preserve qualquer arquivo já criado."); process.exitCode = 1; }
}
