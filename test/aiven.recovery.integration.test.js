import assert from "node:assert/strict";
import test from "node:test";
import mysql from "mysql2/promise";
import net from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { bootstrapAiven } from "../scripts/bootstrap-aiven.js";
import { createDatabasePool, databaseConfig } from "../server/database/connection.js";
import { readTransferSnapshot, transferFingerprint } from "../scripts/cloud-transfer.js";

const digest = value => createHash("sha256").update(value).digest("hex");
test("Aiven recovery: MySQL TLS isolado, retomada e privilégios mínimos", { skip: !process.env.CONNECTCLASS_AIVEN_TEST_PORT }, async t => {
  const port = Number(process.env.CONNECTCLASS_AIVEN_TEST_PORT);
  assert.equal(port, 33079);
  const directory = await mkdtemp(join(tmpdir(), "connectclass-aiven-recovery-"));
  const ca = await readFile(process.env.CONNECTCLASS_AIVEN_TEST_CA, "utf8");
  const env = { DB_HOST: "fixture.aivencloud.com", DB_PORT: String(port), DB_USER: "root",
    DB_PASSWORD: process.env.CONNECTCLASS_AIVEN_TEST_PASSWORD, DB_NAME: "defaultdb", DB_SSL: "true", DB_SSL_CA: ca };
  const routed = config => {
    assert.equal(config.host, "fixture.aivencloud.com");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl.verifyIdentity, true);
    return { ...config, stream: () => net.connect({ host: "127.0.0.1", port }) };
  };
  const connect = config => mysql.createConnection(routed(config));
  const poolFactory = (config, options) => createDatabasePool(routed(config), options);
  const options = { directory, connect, poolFactory };
  const admin = await connect(databaseConfig(env, { admin: true }));
  const [[guard]] = await admin.execute("SELECT @@port AS port, @@datadir AS directory");
  assert.equal(guard.port, port);
  assert.match(guard.directory, /aiven-recovery[\\/]mysql-/);
  async function accountFingerprint() {
    const [rows] = await admin.query("SELECT User, Host, authentication_string FROM mysql.user ORDER BY User, Host");
    return digest(JSON.stringify(rows));
  }
  async function state() {
    const files = await Promise.all([".env.vercel.preview", ".env.vercel.production"].map(file => readFile(join(directory, file), "utf8")));
    const databases = [];
    for (const file of files) {
      const config = parseEnv(file);
      const pool = poolFactory({ ...databaseConfig(config), dateStrings: true }, { connectionLimit: 2 });
      try { databases.push(transferFingerprint(await readTransferSnapshot(pool))); } finally { await pool.end(); }
    }
    return { files: files.map(digest), accounts: await accountFingerprint(), databases };
  }
  try {
    await t.test("inspeção autentica com TLS e não cria recursos", async () => {
      const before = await accountFingerprint();
      const result = await bootstrapAiven(env, { ...options, inspectOnly: true });
      assert.equal(result.adminAuthentication, true);
      assert.equal(result.tls.authorized, true);
      assert.ok(result.resources.every(resource => !resource.exists));
      assert.equal(await accountFingerprint(), before);
    });
    await t.test("falha entre CREATE USER e GRANT preserva registro privado para recuperação", async () => {
      const interrupt = async config => {
        const connection = await connect(config);
        const query = connection.query.bind(connection);
        connection.query = (sql, parameters) => {
          if (sql.startsWith("GRANT SELECT")) throw Object.assign(new Error("fixture interruption"), { code: "ER_FIXTURE_INTERRUPTED" });
          return query(sql, parameters);
        };
        return connection;
      };
      await assert.rejects(bootstrapAiven(env, { ...options, connect: interrupt }), { code: "ER_FIXTURE_INTERRUPTED", stage: "account" });
      const saved = parseEnv(await readFile(join(directory, ".env.vercel.preview"), "utf8"));
      assert.match(saved.DB_USER, /^cc_[a-f0-9]{12}$/);
      const [rows] = await admin.execute("SELECT User FROM mysql.user WHERE User = ?", [saved.DB_USER]);
      assert.equal(rows.length, 1);
    });
    await t.test("retomada completa os dois bancos sem redefinir a conta parcial", async () => {
      const before = await accountFingerprint();
      const saved = await readFile(join(directory, ".env.vercel.preview"), "utf8");
      const user = parseEnv(saved).DB_USER;
      const [[old]] = await admin.execute("SELECT authentication_string AS hash FROM mysql.user WHERE User = ?", [user]);
      const result = await bootstrapAiven(env, options);
      assert.equal(result.applications.length, 2);
      assert.ok(result.applications.every(app => app.authenticated && app.schema && app.leastPrivilege && app.tlsVerified));
      assert.equal(await readFile(join(directory, ".env.vercel.preview"), "utf8"), saved);
      const [[after]] = await admin.execute("SELECT authentication_string AS hash FROM mysql.user WHERE User = ?", [user]);
      assert.equal(digest(after.hash), digest(old.hash));
      assert.notEqual(await accountFingerprint(), before); // Only the missing production account was added.
    });
    await t.test("repetição mantém credenciais, hashes e dados idênticos", async () => {
      const before = await state();
      const result = await bootstrapAiven(env, options);
      assert.ok(result.applications.every(app => app.reusedAccount));
      assert.deepEqual(await state(), before);
    });
    await t.test("senha privada divergente é recusada sem reset nem alteração de privilégios", async () => {
      const path = join(directory, ".env.vercel.preview");
      const original = await readFile(path, "utf8");
      const before = await accountFingerprint();
      await writeFile(path, original.replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD="wrong-fixture-credential"'));
      try { await assert.rejects(bootstrapAiven(env, options), { code: "ER_ACCESS_DENIED_ERROR" }); }
      finally { await writeFile(path, original); }
      assert.equal(await accountFingerprint(), before);
    });
    await t.test("GRANT OPTION global é recusado sem revogar ou ampliar permissões", async () => {
      const saved = parseEnv(await readFile(join(directory, ".env.vercel.preview"), "utf8"));
      await admin.query("GRANT USAGE ON *.* TO ?@'%' WITH GRANT OPTION", [saved.DB_USER]);
      await assert.rejects(bootstrapAiven(env, options), { code: "EXCESSIVE_APP_PRIVILEGES" });
      const [rows] = await admin.query("SHOW GRANTS FOR ?@'%'", [saved.DB_USER]);
      assert.ok(rows.some(row => Object.values(row)[0].includes("WITH GRANT OPTION")));
    });
    await t.test("schema futuro é recusado sem downgrade ou limpeza", async () => {
      const before = await accountFingerprint();
      await admin.query("INSERT INTO connectclass.schema_migrations (version, applied_at) VALUES (2, UTC_TIMESTAMP(3))");
      await assert.rejects(bootstrapAiven(env, options), { code: "UNKNOWN_SCHEMA_VERSION" });
      const [[version]] = await admin.query("SELECT MAX(version) AS version FROM connectclass.schema_migrations");
      assert.equal(version.version, 2);
      assert.equal(await accountFingerprint(), before);
    });
  } finally { await admin.end(); }
});
