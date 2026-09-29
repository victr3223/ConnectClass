import { loadEnvFile } from "node:process";
import { createDatabasePool, databaseConfig } from "../server/database/connection.js";

export async function acquireTestDatabase({ reset = true } = {}) {
  try { loadEnvFile(".env.test"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  const config = databaseConfig();
  if (config.database !== "connectclass_test") throw new Error("Testes recusados: DB_NAME deve ser exatamente connectclass_test.");
  const pool = createDatabasePool(config);
  const guard = await pool.getConnection();
  let locked = false;
  try {
    const [[row]] = await guard.execute("SELECT DATABASE() AS db, GET_LOCK('connectclass:test-fixture', 30) AS acquired");
    locked = row.acquired === 1;
    if (row.db !== "connectclass_test" || !locked) throw new Error("Banco de testes indisponível ou incorreto.");
    if (reset) {
      // Exact isolated test database checked above. No TRUNCATE, DROP or FK disabling.
      await guard.beginTransaction();
      try {
        await guard.execute("DELETE FROM messages");
        await guard.execute("DELETE FROM conversations");
        await guard.execute("DELETE FROM users");
        await guard.execute("DELETE FROM import_batches");
        await guard.commit();
      } catch (error) { await guard.rollback(); throw error; }
    }
    return { config, pool, async release() {
      if (locked) { locked = false; await guard.execute("SELECT RELEASE_LOCK('connectclass:test-fixture')"); }
      guard.release(); await pool.end();
    } };
  } catch (error) {
    if (locked) await guard.execute("SELECT RELEASE_LOCK('connectclass:test-fixture')").catch(()=>{});
    guard.release(); await pool.end(); throw error;
  }
}
