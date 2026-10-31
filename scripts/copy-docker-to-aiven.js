import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabasePool, databaseConfig, safeDatabaseError } from "../server/database/connection.js";
import { TRANSFER_TABLES, readTransferRows, readTransferSnapshot, transferFingerprint, importTransferSnapshot } from "./cloud-transfer.js";

async function exportDockerSnapshot() {
  const source = `import {createDatabasePool,databaseConfig,safeDatabaseError} from './server/database/connection.js';
    const TRANSFER_TABLES=${JSON.stringify(TRANSFER_TABLES)};
    ${readTransferRows.toString()}
    ${readTransferSnapshot.toString()}
    let pool;
    try {
      if(process.env.DB_HOST!=='mysql'||process.env.DB_NAME!=='connectclass') throw new Error('Wrong Docker database');
      pool=createDatabasePool({...databaseConfig(),dateStrings:true});
      process.stdout.write(JSON.stringify(await readTransferSnapshot(pool)));
    } catch(error) { console.error(JSON.stringify(safeDatabaseError(error))); process.exitCode=1; }
    finally { await pool?.end(); }`;
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "exec", "-T", "app", "node", "--input-type=module"],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = []; let size = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30000);
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > 50 * 1024 * 1024) child.kill();
      else chunks.push(chunk);
    });
    // Never echo Docker/SQL output: stdout contains private application records.
    child.stderr.resume();
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => {
      clearTimeout(timer);
      if (code !== 0 || timedOut || size > 50 * 1024 * 1024) return reject(new Error("Exportação Docker indisponível; origem preservada."));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("Exportação inválida.")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(source);
  });
}

let pool;
try {
  if (process.env.DB_NAME !== "connectclass" || !process.env.DB_HOST?.endsWith(".aivencloud.com") || process.env.DB_SSL !== "true") {
    throw new Error("Somente destino Aiven de produção autorizado.");
  }
  const snapshot = await exportDockerSnapshot();
  await mkdir("backups/cloud-transfer", { recursive: true });
  const backup = `backups/cloud-transfer/docker-${Date.now()}.json`;
  await writeFile(backup, JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
  pool = createDatabasePool({ ...databaseConfig(), dateStrings: true }, { connectionLimit: 2 });
  const result = await importTransferSnapshot(pool, snapshot, "connectclass");
  const sourceAfter = await exportDockerSnapshot();
  if (transferFingerprint(sourceAfter) !== result.fingerprint) throw new Error("Origem mudou durante a cópia. Não publicar; reconciliar antes.");
  const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
  await writeFile("backups/cloud-transfer/report.json", JSON.stringify({ result, counts, sourceUnchanged: true, privateBackup: backup }, null, 2));
  console.info("Cópia MySQL reconciliada por hash; IDs e hashes de senha preservados. Banco Docker intacto. Relatório privado em backups/cloud-transfer/report.json.");
} catch (error) {
  console.error("Cópia interrompida; não publicar nem limpar dados:", safeDatabaseError(error));
  process.exitCode = 1;
} finally { await pool?.end(); }
