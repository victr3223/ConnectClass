import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, validatePassword, verifyPassword } from "../server/passwords.js";
import { createSessionStore, readCookies, serializeSessionCookie } from "../server/sessions.js";
import { databaseConfig, transaction, safeDatabaseError } from "../server/database/connection.js";
import { buildMessageFilter, normalizeCategory, normalizeManagerFilters, normalizeMessage } from "../server/messages.js";
import { createConnectClassApp } from "../server/app.js";
import { validateStudentInput } from "../server/users.js";

test("senha preserva espaços, usa salt único e rejeita hashes inválidos", async () => {
  const password = " Senha de teste! ";
  assert.equal(validatePassword(password), null);
  assert.ok(validatePassword("curta"));
  assert.ok(validatePassword("a".repeat(129)));
  const hash = await hashPassword(password);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(password.trim(), hash), false);
  for (const invalid of [null, "scrypt$999999999$8$1$salt$hash", hash.replace("scrypt", "bcrypt"), "invalid"]) {
    assert.equal(await verifyPassword(password, invalid), false);
  }
});

test("sessões expiram, têm tokens diferentes e logout invalida imediatamente", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const store = createSessionStore({ regularTtlMs: 100, rememberedTtlMs: 200 });
  const short = store.create(1, false);
  const long = store.create(1, true);
  assert.notEqual(short.token, long.token);
  assert.equal(store.get(short.token).userId, 1);
  t.mock.timers.tick(101);
  assert.equal(store.get(short.token), null);
  assert.ok(store.get(long.token));
  store.destroy(long.token);
  assert.equal(store.get(long.token), null);
  assert.equal(store.get("forjado"), null);
});

test("cookies ignoram codificação inválida e não herdam propriedades", () => {
  const parsed = readCookies("a=ok; invalido=%ZZ; __proto__=texto; x=parte%3Digual");
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(parsed.invalido, undefined);
  assert.equal(parsed.x, "parte=igual");
  assert.match(serializeSessionCookie("", 0, true), /HttpOnly; SameSite=Strict; Max-Age=0; Secure/);
  assert.doesNotMatch(serializeSessionCookie("abc", Date.now() + 9000, false), /Secure/);
});

test("configuração exige banco e usuário próprio e erro público não contém segredo", () => {
  const env = { DB_HOST: "localhost", DB_USER: "app_fixture", DB_PASSWORD: "Only-fixture!", DB_NAME: "connectclass_test" };
  assert.equal(databaseConfig(env).timezone, "Z");
  for (const overrides of [{ DB_USER: "root" }, { DB_PORT: "invalid" }, { DB_PASSWORD: "" }, { DB_NAME: "x; DROP DATABASE y" }]) {
    assert.throws(() => databaseConfig({ ...env, ...overrides }));
  }
  assert.deepEqual(safeDatabaseError({ code: "ER_PARSE_ERROR", sql: "segredo", message: "segredo", password: "segredo" }), { code: "ER_PARSE_ERROR" });
});
test("normalização mantém categorias e limites sem aceitar propriedades herdadas", () => {
  assert.equal(normalizeCategory("perguntas"), "Pergunta");
  assert.equal(normalizeCategory("__proto__"), null);
  assert.equal(normalizeMessage(" texto\n "), "texto");
  assert.throws(() => normalizeMessage("x".repeat(1001)));
  assert.throws(() => normalizeManagerFilters({ dataInicial: "2026-02-30" }));
  const dates = normalizeManagerFilters({ dataInicial: "2026-09-05", dataFinal: "2026-09-05" });
  assert.equal(new Date(dates.dataInicial).toISOString(), "2026-09-05T03:00:00.000Z");
  assert.equal(new Date(dates.dataFinal).toISOString(), "2026-09-06T02:59:59.999Z");
  assert.ok(validateStudentInput({}).nome);
});
test("filtros SQL separam valores e tratam busca literalmente", () => {
  const search = "' OR 1=1; -- % _";
  const filter = buildMessageFilter({ search, turma: "'x", alunoId: 17 });
  assert.equal(filter.sql.includes(search), false);
  assert.equal(filter.params.includes(search), true);
  assert.match(filter.sql, /LOCATE\(\?/);
  assert.equal(filter.params[0], 17);
});
test("transação faz commit ou rollback e sempre libera conexão", async () => {
  const events = [];
  const connection = { async beginTransaction() {events.push("begin");}, async commit() {events.push("commit");},
    async rollback(){events.push("rollback");}, release(){events.push("release");} };
  const pool = { async getConnection(){return connection;} };
  assert.equal(await transaction(pool, async () => 42), 42);
  assert.deepEqual(events, ["begin","commit","release"]);
  events.length = 0;
  await assert.rejects(transaction(pool, async () => {throw new Error("fixture");}), /fixture/);
  assert.deepEqual(events, ["begin","rollback","release"]);
});
test("runtime não admite diretório JSON legado", async () => {
  await assert.rejects(createConnectClassApp({ dataDirectory: "unused" }), /JSON desativada/);
});
