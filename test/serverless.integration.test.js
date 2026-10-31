import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createConnectClassApp } from "../server/app.js";
import { acquireTestDatabase } from "./mysql-fixture.js";
import { createMysqlSessionStore } from "../server/database/serverless-auth.js";
import { createDatabasePool } from "../server/database/connection.js";
import { setTimeout as wait } from "node:timers/promises";

async function setup(options = {}) {
  const fixture = await acquireTestDatabase();
  const apps = [];
  try {
    await fixture.pool.execute("DELETE FROM auth_attempts");
    const managerPassword = randomBytes(24).toString("base64url");
    for (let i = 0; i < 2; i++) {
      const app = await createConnectClassApp({ database: fixture.config, managerPassword, durableAuth: true,
        logger: { info() {} }, ...options });
      apps.push(app);
      await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
      app.baseUrl = `http://127.0.0.1:${app.server.address().port}`;
    }
    return { fixture, apps, async close() { for (const app of apps) await app.close(); await fixture.release(); } };
  } catch (error) { for (const app of apps) await app.close(); await fixture.release(); throw error; }
}

async function request(app, path, { body, cookie } = {}) {
  const response = await fetch(app.baseUrl + path, { method: body ? "POST" : "GET", redirect: "manual",
    signal: AbortSignal.timeout(15000), headers: { ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

test("serverless: outra instância reconhece a sessão e o logout compartilhado", async () => {
  const state = await setup();
  try {
    const registered = await request(state.apps[0], "/api/auth/register", { body: { nome: "Aluno Fictício", ra: "V0001",
      turma: "3A", email: "aluno@example.test", senha: "Ficticia!12345", confirmacaoSenha: "Ficticia!12345" } });
    assert.equal(registered.status, 201);
    const another = await request(state.apps[1], "/api/auth/me", { cookie: registered.cookie });
    assert.equal(another.status, 200);
    assert.equal(another.body.user.id, registered.body.user.id);
    const [rows] = await state.fixture.pool.execute("SELECT token_hash FROM web_sessions");
    assert.equal(rows.length, 1);
    assert.match(rows[0].token_hash, /^[a-f0-9]{64}$/);
    assert.equal(rows[0].token_hash.includes(registered.cookie.split("=")[1]), false);
    await state.apps[0].close();
    const restarted = await createConnectClassApp({ database: state.fixture.config, durableAuth: true, logger: { info() {} } });
    state.apps.push(restarted);
    await new Promise(resolve => restarted.server.listen(0, "127.0.0.1", resolve));
    restarted.baseUrl = `http://127.0.0.1:${restarted.server.address().port}`;
    assert.equal((await request(restarted, "/api/auth/me", { cookie: registered.cookie })).status, 200);
    assert.equal((await request(state.apps[1], "/api/auth/logout", { cookie: registered.cookie, body: {} })).status, 200);
    assert.equal((await request(restarted, "/api/auth/me", { cookie: registered.cookie })).status, 401);
  } finally { await state.close(); }
});

test("serverless: limite de login compartilhado resiste a requisições concorrentes", async () => {
  const state = await setup({ authRateLimit: 3 });
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => request(state.apps[i % 2], "/api/auth/login",
      { body: { identificador: "inexistente@example.test", senha: "Ficticia!12345" } })));
    assert.equal(results.filter(r => r.status === 401).length, 3);
    assert.equal(results.filter(r => r.status === 429).length, 5);
    await state.fixture.pool.execute("UPDATE auth_attempts SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND");
    assert.equal((await request(state.apps[1], "/api/auth/login", { body: {
      identificador: "inexistente@example.test", senha: "Ficticia!12345" } })).status, 401);
  } finally { await state.close(); }
});

test("serverless: sessão expirada e token malformado são recusados no MySQL", async () => {
  const state = await setup();
  try {
    const [[user]] = await state.fixture.pool.execute("SELECT id FROM users LIMIT 1");
    const store = createMysqlSessionStore(state.fixture.pool, { regularTtlMs: 60000, rememberedTtlMs: 120000 });
    const session = await store.create(user.id, false);
    assert.equal((await store.get(session.token)).userId, user.id);
    await state.fixture.pool.execute("UPDATE web_sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND");
    assert.equal(await store.get(session.token), null);
    for (const token of [undefined, "' OR 1=1 --", "bad", "x".repeat(5000)]) assert.equal(await store.get(token), null);
  } finally { await state.close(); }
});

test("serverless: pool reduzido libera conexões ociosas antes de uma nova requisição", async () => {
  const fixture = await acquireTestDatabase();
  const pool = createDatabasePool(fixture.config, { connectionLimit: 3, idleTimeout: 50 });
  try {
    const [[first]] = await pool.execute("SELECT CONNECTION_ID() AS id");
    await wait(1400);
    const [[second]] = await pool.execute("SELECT CONNECTION_ID() AS id");
    assert.notEqual(second.id, first.id);
  } finally { await pool.end(); await fixture.release(); }
});
