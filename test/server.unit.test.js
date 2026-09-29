import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, validatePassword, verifyPassword } from "../server/passwords.js";
import { createSessionStore, readCookies, serializeSessionCookie } from "../server/sessions.js";
import { databaseConfig, transaction, safeDatabaseError } from "../server/database/connection.js";
import { buildMessageFilter, normalizeCategory, normalizeManagerFilters, normalizeMessage } from "../server/messages.js";
import { createConnectClassApp } from "../server/app.js";
import { validateStudentInput } from "../server/users.js";
import { httpConfig } from "../server/config.js";
import { initializeSchema } from "../server/database/migrations.js";

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
  const env = { DB_HOST: "localhost", DB_USER: "app_fixture", DB_PASSWORD: "Only-fixture!", DB_NAME: "connectclass_final_test" };
  assert.equal(databaseConfig(env).timezone, "Z");
  assert.equal(databaseConfig({ ...env, DB_NAME: "provider-app_123" }).database, "provider-app_123");
  for (const overrides of [{ DB_USER: "root" }, { DB_PORT: "invalid" }, { DB_PASSWORD: "" }, { DB_NAME: "" }, { DB_NAME: "a".repeat(65) }, { DB_NAME: "x; DROP DATABASE y" }]) {
    assert.throws(() => databaseConfig({ ...env, ...overrides }));
  }
  assert.deepEqual(safeDatabaseError({ code: "ER_PARSE_ERROR", sql: "segredo", message: "segredo", password: "segredo" }), { code: "ER_PARSE_ERROR" });
});
test("produção respeita PORT e escuta em host público por padrão sem mudar desenvolvimento", () => {
  assert.deepEqual(httpConfig({}), { host: "127.0.0.1", port: 8081 });
  assert.deepEqual(httpConfig({ NODE_ENV: "production", PORT: "4321" }), { host: "0.0.0.0", port: 4321 });
  assert.deepEqual(httpConfig({ NODE_ENV: "production", HOST: "::", PORT: "0" }), { host: "::", port: 0 });
  for (const port of ["invalid", "65536", "-1", "1.2"]) assert.throws(() => httpConfig({ PORT: port }));
});
test("MySQL TLS valida certificado/identidade e rejeita configuração ambígua", () => {
  const env = { DB_HOST: "mysql.example.test", DB_USER: "app", DB_PASSWORD: "fixture", DB_NAME: "app" };
  assert.equal(databaseConfig(env).ssl, undefined);
  assert.deepEqual(databaseConfig({ ...env, DB_SSL: "true" }).ssl,
    { rejectUnauthorized: true, verifyIdentity: true, minVersion: "TLSv1.2" });
  assert.equal(databaseConfig({ ...env, DB_SSL: "true", DB_SSL_CA: "test\\nca" }).ssl.ca, "test\nca");
  assert.throws(() => databaseConfig({ ...env, DB_SSL: "typo" }));
  assert.throws(() => databaseConfig({ ...env, DB_SSL_CA: "test" }));
});
test("schema aceita banco do provedor sem CREATE DATABASE implícito nem identificador SQL injetável", async () => {
  const statements = [];
  const connection = { async query(sql) { statements.push(sql); } };
  await initializeSchema(connection, "provider-app_123");
  assert.equal(statements[0], "USE `provider-app_123`");
  assert.equal(statements.some(sql => /CREATE DATABASE|DROP |TRUNCATE /.test(sql)), false);
  assert.equal(statements.filter(sql => /CREATE TABLE/.test(sql)).length, 5);
  statements.length = 0;
  await assert.rejects(initializeSchema(connection, "a`; DROP DATABASE b"));
  assert.equal(statements.length, 0);
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
