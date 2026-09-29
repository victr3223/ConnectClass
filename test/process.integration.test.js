import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { acquireTestDatabase } from "./mysql-fixture.js";

async function startProcess(config, managerPassword) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DB_HOST: config.host, DB_PORT: String(config.port), DB_USER: config.user,
      DB_PASSWORD: config.password, DB_NAME: "connectclass_final_test", HOST: "127.0.0.1", PORT: "0",
      NODE_ENV: "test", CONNECTCLASS_GESTOR_PASSWORD: managerPassword },
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  // Never echo process output: even a failed test must not print environment/credentials.
  child.stderr.resume();
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    let timer;
    try { await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Processo de teste não encerrou no prazo.")); }, 15000);
    })]); } finally { clearTimeout(timer); }
  }
  try {
    const baseUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Servidor de teste não iniciou no prazo.")), 15000);
      let output = "", settled = false;
      function finish(error, value) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      }
      child.once("error", () => finish(new Error("Falha ao iniciar processo de teste.")));
      child.once("exit", () => finish(new Error("Processo terminou antes de servir HTTP.")));
      child.stdout.on("data", (chunk) => {
        output = (output + chunk.toString()).slice(-4096);
        const match = /Servidor disponível em (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match) finish(null, match[1]);
      });
    });
    return { baseUrl, stop };
  } catch (error) { await stop(); throw error; }
}

async function request(app, path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(app.baseUrl + path, { method, redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

test("HTTP + MySQL: fluxo completo persiste após encerrar e iniciar outro processo Node, sem JSON", { timeout: 60000 }, async () => {
  const fixture = await acquireTestDatabase();
  const dataPath = new URL("../data/", import.meta.url);
  const filesBefore = await readdir(dataPath);
  const legacyNames = filesBefore.filter((name) => name.endsWith(".json"));
  const legacyDigests = await Promise.all(legacyNames.map(async (name) => createHash("sha256").update(await readFile(new URL(name, dataPath))).digest("hex")));
  const managerPassword = randomBytes(24).toString("base64url");
  const studentPassword = randomBytes(24).toString("base64url");
  let app;
  try {
    app = await startProcess(fixture.config, managerPassword);
    const student = await request(app, "/api/auth/register", { method: "POST", body: {
      nome: "Aluno processo fictício", ra: "000042", turma: "3º B", email: "processo@example.test",
      senha: studentPassword, confirmacaoSenha: studentPassword, tipo: "gestor" } });
    assert.equal(student.status, 201); assert.equal(student.body.user.tipo, "aluno");
    const sent = [];
    for (const categoria of ["Pergunta", "Reclamação", "Sugestão"]) {
      const result = await request(app, "/api/mensagens", { method: "POST", cookie: student.cookie,
        body: { categoria, mensagem: `Teste de ${categoria} com acento e emoji 😀` } });
      assert.equal(result.status, 201); sent.push(result.body.mensagem);
    }
    assert.equal((await request(app, "/api/gestor", { cookie: student.cookie })).status, 403);
    const manager = await request(app, "/api/auth/login", { method: "POST", body: {
      identidade: "gestor@connectclass.local", senha: managerPassword } });
    assert.equal(manager.status, 200);
    assert.equal((await request(app, `/api/gestor/mensagens/${sent[0].id}/respostas`, {
      method: "POST", cookie: manager.cookie, body: { mensagem: "Resposta persistida 😀" } })).status, 201);
    assert.equal((await request(app, `/api/gestor/mensagens/${sent[0].id}/status`, {
      method: "PATCH", cookie: manager.cookie, body: { status: "Resolvida" } })).status, 200);
    const filtered = await request(app, "/api/gestor?categoria=perguntas&status=Resolvida&busca=persistida", { cookie: manager.cookie });
    assert.equal(filtered.body.conversas.length, 1); assert.equal(filtered.body.dashboard.total, 3);
    await app.stop();
    // A different Node process with a fresh pool/session store, reusing only MySQL.
    app = await startProcess(fixture.config, "NaoPodeRedefinir!2026");
    assert.equal((await request(app, "/api/auth/me", { cookie: student.cookie })).status, 401);
    const relogin = await request(app, "/api/auth/login", { method: "POST", body: { identidade: "000042", senha: studentPassword } });
    assert.equal(relogin.status, 200);
    const history = await request(app, "/api/mensagens", { cookie: relogin.cookie });
    assert.equal(history.body.mensagens.length, 3);
    const restored = history.body.mensagens.find((m) => m.id === sent[0].id);
    assert.equal(restored.status, "Resolvida"); assert.equal(restored.dataHora, sent[0].dataHora);
    assert.equal(restored.respostas[0].mensagem, "Resposta persistida 😀");
    assert.equal((await request(app, "/api/auth/login", { method: "POST", body: {
      identidade: "gestor@connectclass.local", senha: managerPassword } })).status, 200);
    assert.equal((await request(app, "/api/auth/logout", { method: "POST", cookie: relogin.cookie, body: {} })).status, 200);
    assert.equal((await request(app, "/api/auth/me", { cookie: relogin.cookie })).status, 401);
    assert.deepEqual(await readdir(dataPath), filesBefore);
    const afterDigests = await Promise.all(legacyNames.map(async (name) => createHash("sha256").update(await readFile(new URL(name, dataPath))).digest("hex")));
    assert.deepEqual(afterDigests, legacyDigests, "JSON legado não deve ser alterado pelo runtime MySQL.");
    for (const name of ["app.js", "users.js", "messages.js"]) {
      const source = await readFile(new URL(`../server/${name}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /json-store|import-json|usuarios\.json|mensagens\.json/);
    }
  } finally { await app?.stop(); await fixture.release(); }
});
