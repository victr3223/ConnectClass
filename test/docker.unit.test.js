import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createDockerEnvironment } from "../scripts/setup-docker-env.js";
import { migrateDockerSchema } from "../server/database/docker-migrations.js";

const env = { DB_HOST: "mysql", DB_USER: "app", DB_PASSWORD: "fixture", DB_NAME: "connectclass",
  DB_MIGRATION_USER: "migrator", DB_MIGRATION_PASSWORD: "migration-fixture" };
function fixture({ versions = [1], lock = 1, ddlError = false } = {}) {
  const events = [], queries = [];
  return { events, queries, connection: {
    async execute(sql) {
      if (sql.includes("GET_LOCK")) { events.push("lock"); return [[{ acquired: lock }]]; }
      if (sql.includes("RELEASE_LOCK")) { events.push("unlock"); return [[]]; }
      if (sql.includes("SELECT version")) return [versions.map(version => ({version}))];
      return [[]];
    },
    async query(sql) { queries.push(sql); if (ddlError) throw Object.assign(new Error("fixture"), {code:"ER_TABLEACCESS_DENIED_ERROR"}); },
    async end() { events.push("end"); }
  } };
}
test("Docker: gera arquivos separados sem root no app e recusa sobrescrever credenciais", async () => {
  const dir = await mkdtemp(join(tmpdir(), "connectclass-docker-unit-"));
  try {
    await createDockerEnvironment(dir);
    const appText = await readFile(join(dir, ".env.docker.app"), "utf8");
    const app = parseEnv(appText), mysql = parseEnv(await readFile(join(dir, ".env.docker.mysql"), "utf8"));
    assert.ok(app.DB_PASSWORD === mysql.MYSQL_PASSWORD);
    assert.ok(app.DB_MIGRATION_PASSWORD === mysql.DB_MIGRATION_PASSWORD);
    assert.ok(app.DB_PASSWORD !== app.DB_MIGRATION_PASSWORD && app.DB_PASSWORD.length >= 40);
    assert.equal(app.MYSQL_ROOT_PASSWORD, undefined);
    await assert.rejects(createDockerEnvironment(dir), /já existe/);
    assert.ok(await readFile(join(dir, ".env.docker.app"), "utf8") === appText);
  } finally { await rm(dir, { recursive:true, force:true }); }
});
test("Docker: migração usa conta separada, espera falha transitória e libera lock", async () => {
  const f = fixture(); let attempts = 0, waits = 0;
  await migrateDockerSchema({ env, connect: async config => {
    assert.equal(config.user, "migrator");
    if (++attempts === 1) throw Object.assign(new Error("fixture"), {code:"ECONNREFUSED"});
    return f.connection;
  }, wait: async () => { waits++; } });
  assert.equal(waits, 1); assert.deepEqual(f.events, ["lock","unlock","end"]);
  assert.equal(f.queries.filter(sql=>sql.startsWith("CREATE TABLE")).length, 5);
  assert.ok(f.queries.every(sql=>!/^DROP|^TRUNCATE|^DELETE/i.test(sql)));
});
test("Docker: schema futuro recusa downgrade sem DDL", async () => {
  const f = fixture({ versions:[2] });
  await assert.rejects(migrateDockerSchema({ env, connect:async()=>f.connection }), /futuro/);
  assert.equal(f.queries.length, 0); assert.deepEqual(f.events, ["lock","unlock","end"]);
});
test("Docker: falha de DDL fecha conexão e não apaga dados", async () => {
  const f = fixture({ ddlError:true });
  await assert.rejects(migrateDockerSchema({ env, connect:async()=>f.connection }));
  assert.deepEqual(f.events, ["lock","unlock","end"]);
});
test("Docker: não prossegue sem lock nem repete erro de autenticação", async () => {
  const f = fixture({lock:0});
  await assert.rejects(migrateDockerSchema({ env, connect:async()=>f.connection }), /ocupada/);
  assert.deepEqual(f.events, ["lock","end"]); assert.equal(f.queries.length, 0);
  let attempts=0;
  await assert.rejects(migrateDockerSchema({env,connect:async()=>{attempts++;throw Object.assign(new Error("fixture"),{code:"ER_ACCESS_DENIED_ERROR"});}}));
  assert.equal(attempts,1);
  await assert.rejects(migrateDockerSchema({env:{...env,DB_MIGRATION_USER:"app"}}), /separadas/);
});
