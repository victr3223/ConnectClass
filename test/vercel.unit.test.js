import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, cp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createVercelHandler, vercelClientAddress } from "../server/vercel.js";
import { createDatabasePool, databaseConfig } from "../server/database/connection.js";

const env = { DB_HOST: "db.example.test", DB_USER: "app", DB_PASSWORD: "fixture-only", DB_NAME: "connectclass", DB_SSL: "true" };
async function serve(handler, work) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("Vercel: falha de inicialização responde 503 sem segredos e próxima chamada recupera", async () => {
  let calls = 0;
  const logs = [];
  const handler = createVercelHandler({ env, logger: { error(...args) { logs.push(args); } }, createApp: async () => {
    if (++calls === 1) throw Object.assign(new Error("private database password"), { code: "ECONNREFUSED" });
    return { handler(_req, res) { res.end("ready"); } };
  } });
  await serve(handler, async base => {
    const failed = await fetch(base);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await failed.text(), /private|password|fixture-only/);
    assert.equal(await (await fetch(base)).text(), "ready");
    assert.equal(calls, 2);
    assert.doesNotMatch(JSON.stringify(logs), /private|password|fixture-only/);
  });
});

test("Vercel: concorrência reutiliza inicialização e configuração exige TLS", async () => {
  let calls = 0;
  const handler = createVercelHandler({ env, createApp: async options => {
    calls++;
    assert.equal(options.poolLimit, 3);
    assert.equal(options.durableAuth, true);
    assert.equal(options.isProduction, true);
    return { handler(_req, res) { res.end("ready"); } };
  } });
  await serve(handler, async base => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => fetch(base)));
    assert.ok(responses.every(response => response.status === 200));
    await Promise.all(responses.map(response => response.text()));
    assert.equal(calls, 1);
  });
  await serve(createVercelHandler({ env: { ...env, DB_SSL: "false" }, logger: { error() {} } }), async base => {
    assert.equal((await fetch(base)).status, 503);
  });
});

test("Vercel: endereço de cliente inválido não contorna o bucket compartilhado", () => {
  assert.equal(vercelClientAddress({ headers: { "x-forwarded-for": "192.0.2.1" } }), "192.0.2.1");
  assert.equal(vercelClientAddress({ headers: { "x-forwarded-for": "2001:db8::1" } }), "2001:db8::1");
  assert.equal(vercelClientAddress({ headers: { "x-forwarded-for": "made-up-address" } }), "unknown");
  assert.equal(vercelClientAddress({ headers: {} }), "unknown");
});

test("Vercel: inicialização aceita o pool Promise MySQL2 real sem abrir conexão", async () => {
  let pool;
  const handler = createVercelHandler({ env, logger: { error() {} }, createApp: async options => {
    pool = createDatabasePool(databaseConfig(env), { connectionLimit: 3, idleTimeout: 5000 });
    options.onPoolCreated(pool);
    return { handler(_req, res) { res.end("ready"); } };
  } });
  try {
    await serve(handler, async base => {
      const response = await fetch(base);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "ready");
    });
  } finally { await pool?.end(); }
});

test("Vercel: build copia apenas assets públicos e conserva seus bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "connectclass-vercel-build-"));
  const files = ["styles.css", "manager.css", "script.js", "gestor.js", "message-ui.js", "assets/logo.png",
    "Captura de tela de 2026-06-07 23-06-40.png"];
  for (const file of [...files, "scripts/build-vercel.js"]) await cp(file, join(directory, file), { recursive: true });
  const result = spawnSync(process.execPath, [join(directory, "scripts/build-vercel.js")], { cwd: directory, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  for (const file of files) assert.deepEqual(await readFile(join(directory, "public", file)), await readFile(file));
  const published = await readdir(join(directory, "public"), { recursive: true });
  assert.equal(published.some(file => /\.html$|\.env|schema|server|backup|comercial/.test(file)), false);
});
