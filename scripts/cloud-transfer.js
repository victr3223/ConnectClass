import { createHash } from "node:crypto";
import { verifySchema } from "../server/database/migrations.js";

export const TRANSFER_TABLES = {
  users: ["id", "nome", "ra", "email", "senha_hash", "tipo", "turma", "created_at", "updated_at"],
  conversations: ["id", "usuario_id", "categoria", "status", "nome_aluno_snapshot", "ra_snapshot", "turma_snapshot", "created_at", "updated_at", "last_activity_at"],
  messages: ["id", "conversation_id", "sender_id", "sender_type", "sender_name_snapshot", "content", "created_at", "legacy_reply_id"],
  import_batches: ["fingerprint", "users_count", "conversations_count", "replies_count", "imported_at"],
};

export async function readTransferRows(connection) {
  const tables = {};
  for (const [table, columns] of Object.entries(TRANSFER_TABLES)) {
    const [rows] = await connection.execute(`SELECT ${columns.map(column => `\`${column}\``).join(",")} FROM \`${table}\` ORDER BY \`${columns[0]}\``);
    tables[table] = rows;
  }
  return tables;
}

export async function readTransferSnapshot(pool) {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET TRANSACTION READ ONLY");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [versions] = await connection.execute("SELECT version FROM schema_migrations ORDER BY version");
    if (versions.length !== 1 || versions[0].version !== 1) throw new Error("Source schema incompatible");
    const tables = await readTransferRows(connection);
    await connection.commit();
    return { schemaVersion: 1, tables };
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { connection.release(); }
}

export function transferFingerprint(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot.tables)).digest("hex");
}

export async function importTransferSnapshot(pool, snapshot, expectedDatabase) {
  if (snapshot?.schemaVersion !== 1 || !snapshot.tables ||
      Object.keys(snapshot.tables).join(",") !== Object.keys(TRANSFER_TABLES).join(",")) throw new Error("Snapshot inválido.");
  for (const [table, columns] of Object.entries(TRANSFER_TABLES)) {
    if (!Array.isArray(snapshot.tables[table])) throw new Error("Snapshot inválido.");
    for (const row of snapshot.tables[table]) {
      if (Object.keys(row).join(",") !== columns.join(",")) throw new Error("Colunas divergentes.");
    }
  }
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [[identity]] = await connection.execute("SELECT DATABASE() AS db");
    if (identity.db !== expectedDatabase) throw new Error("Banco de destino divergente.");
    await verifySchema(connection);
    const [[lock]] = await connection.execute("SELECT GET_LOCK(CONCAT(DATABASE(), ':cloud-import'), 30) AS acquired");
    if (lock.acquired !== 1) throw new Error("Importação ocupada.");
    locked = true;
    await connection.beginTransaction();
    const before = await readTransferRows(connection);
    const fingerprint = transferFingerprint(snapshot);
    if (Object.values(before).some(rows => rows.length)) {
      if (transferFingerprint({ tables: before }) !== fingerprint) throw new Error("Destino não vazio e divergente; não sobrescrever.");
      await connection.rollback();
      return { alreadyImported: true, fingerprint };
    }
    for (const [table, columns] of Object.entries(TRANSFER_TABLES)) {
      const sql = `INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
      for (const row of snapshot.tables[table]) await connection.execute(sql, columns.map(column => row[column]));
    }
    const after = await readTransferRows(connection);
    if (transferFingerprint({ tables: after }) !== fingerprint) throw new Error("Reconciliação divergente.");
    await connection.commit();
    return { alreadyImported: false, fingerprint };
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally {
    if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':cloud-import'))").catch(() => {});
    connection.release();
  }
}
