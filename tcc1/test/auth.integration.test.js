import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createConnectClassApp } from "../server/app.js";

async function startApplication(dataDirectory = null) {
  const directory = dataDirectory ?? (await mkdtemp(join(tmpdir(), "connectclass-test-")));
  const managerPassword = `G!${randomBytes(16).toString("base64url")}`;
  const app = await createConnectClassApp({
    dataDirectory: directory,
    managerPassword,
    logger: { info() {} },
  });
  const port = await listen(app.server);

  return {
    ...app,
    dataDirectory: directory,
    managerPassword,
    baseUrl: `http://127.0.0.1:${port}`,
    async close({ removeData = true } = {}) {
      await closeServer(app.server);
      if (removeData) await rm(directory, { recursive: true, force: true });
    },
  };
}

async function request(application, path, { method = "GET", body, cookie, redirect = "manual" } = {}) {
  const response = await fetch(`${application.baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const contentType = response.headers.get("content-type") ?? "";

  const setCookie = response.headers.get("set-cookie");
  return {
    status: response.status,
    body: contentType.includes("application/json") ? await response.json() : await response.text(),
    cookie: setCookie?.split(";")[0] ?? null,
    setCookie,
    location: response.headers.get("location"),
  };
}

function validStudent(overrides = {}) {
  return {
    nome: "Ana Maria Santos",
    ra: "2026001",
    turma: "3º Ano B",
    email: "ana.santos@escola.edu.br",
    senha: "SenhaSegura!1",
    confirmacaoSenha: "SenhaSegura!1",
    ...overrides,
  };
}

test("cadastro valida campos, persiste hash e cria sessão de aluno", async () => {
  const application = await startApplication();
  try {
    const registered = await request(application, "/api/auth/register", {
      method: "POST",
      body: { ...validStudent(), tipo: "gestor" },
    });

    assert.equal(registered.status, 201);
    assert.ok(registered.cookie);
    assert.match(registered.setCookie, /HttpOnly/);
    assert.match(registered.setCookie, /SameSite=Strict/);
    assert.equal(registered.body.user.tipo, "aluno");
    assert.equal("senhaHash" in registered.body.user, false);

    const session = await request(application, "/api/auth/me", { cookie: registered.cookie });
    assert.equal(session.status, 200);
    assert.equal(session.body.user.ra, "2026001");

    const storedUsers = JSON.parse(await readFile(application.usersFile, "utf8"));
    const storedStudent = storedUsers.usuarios.find((user) => user.ra === "2026001");
    assert.match(storedStudent.senhaHash, /^scrypt\$/);
    assert.equal(JSON.stringify(storedStudent).includes(validStudent().senha), false);

    const duplicateRa = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent({ email: "outro@escola.edu.br" }),
    });
    assert.equal(duplicateRa.status, 409);
    assert.equal(duplicateRa.body.fields.ra, "Este RA já está cadastrado.");

    const duplicateEmail = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent({ ra: "2026002" }),
    });
    assert.equal(duplicateEmail.status, 409);
    assert.equal(duplicateEmail.body.fields.email, "Este e-mail já está cadastrado.");

    const invalid = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent({ ra: "2026003", email: "invalido", senha: "curta", confirmacaoSenha: "diferente" }),
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.fields.email, "Informe um e-mail válido.");
    assert.ok(invalid.body.fields.senha);
    assert.equal(invalid.body.fields.confirmacaoSenha, "As senhas não coincidem.");

    const emailAsRa = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent({ ra: "ra@escola.edu.br", email: "ra-diferente@escola.edu.br" }),
    });
    assert.equal(emailAsRa.status, 422);
    assert.equal(emailAsRa.body.fields.ra, "Informe um RA válido, não um e-mail.");
  } finally {
    await application.close();
  }
});

test("login aceita RA ou e-mail e os recursos aplicam autenticação e autorização", async () => {
  const application = await startApplication();
  try {
    const registered = await request(application, "/api/auth/register", { method: "POST", body: validStudent() });
    const unauthenticated = await request(application, "/api/aluno");
    assert.equal(unauthenticated.status, 401);

    const wrongPassword = await request(application, "/api/auth/login", {
      method: "POST",
      body: { identidade: "2026001", senha: "senha-incorreta" },
    });
    assert.equal(wrongPassword.status, 401);

    const byRa = await request(application, "/api/auth/login", {
      method: "POST",
      body: { identidade: "2026001", senha: validStudent().senha },
    });
    assert.equal(byRa.status, 200);
    assert.equal(byRa.body.user.tipo, "aluno");

    const byEmail = await request(application, "/api/auth/login", {
      method: "POST",
      body: { identidade: "ANA.SANTOS@ESCOLA.EDU.BR", senha: validStudent().senha },
    });
    assert.equal(byEmail.status, 200);

    const studentArea = await request(application, "/api/aluno", { cookie: registered.cookie });
    assert.equal(studentArea.status, 200);
    const deniedDashboard = await request(application, "/api/gestor", { cookie: registered.cookie });
    assert.equal(deniedDashboard.status, 403);
    const deniedPage = await request(application, "/gestor", { cookie: registered.cookie });
    assert.equal(deniedPage.status, 403);

    const managerLogin = await request(application, "/api/auth/login", {
      method: "POST",
      body: { identidade: "gestor@connectclass.local", senha: application.managerPassword },
    });
    assert.equal(managerLogin.status, 200);
    assert.equal(managerLogin.body.user.tipo, "gestor");
    const managerArea = await request(application, "/api/gestor", { cookie: managerLogin.cookie });
    assert.equal(managerArea.status, 200);
    const managerDeniedStudentArea = await request(application, "/api/aluno", { cookie: managerLogin.cookie });
    assert.equal(managerDeniedStudentArea.status, 403);

    const unauthenticatedPage = await request(application, "/aluno");
    assert.equal(unauthenticatedPage.status, 302);
    assert.equal(unauthenticatedPage.location, "/login");
    const hiddenDemoData = await request(application, "/data.json");
    assert.equal(hiddenDemoData.status, 404);
  } finally {
    await application.close();
  }
});

test("usuários e a estrutura de mensagens sobrevivem ao reinício do servidor", async () => {
  const firstApplication = await startApplication();
  let secondApplication;
  try {
    const registered = await request(firstApplication, "/api/auth/register", {
      method: "POST",
      body: validStudent(),
    });
    assert.equal(registered.status, 201);
    await firstApplication.close({ removeData: false });

    secondApplication = await startApplication(firstApplication.dataDirectory);
    const loggedIn = await request(secondApplication, "/api/auth/login", {
      method: "POST",
      body: { identidade: "2026001", senha: validStudent().senha },
    });
    assert.equal(loggedIn.status, 200);

    const messages = JSON.parse(await readFile(secondApplication.messagesFile, "utf8"));
    assert.deepEqual(messages, { mensagens: [] });
  } finally {
    if (secondApplication) await secondApplication.close();
    else await firstApplication.close();
  }
});

test("aluno cria histórico persistente e recebe somente suas próprias mensagens", async () => {
  const application = await startApplication();
  try {
    const firstStudent = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent(),
    });
    const secondStudent = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent({
        nome: "Bruno Alves",
        ra: "2026002",
        email: "bruno.alves@escola.edu.br",
      }),
    });

    const firstMessage = await request(application, "/api/mensagens", {
      method: "POST",
      cookie: firstStudent.cookie,
      body: { categoria: "perguntas", mensagem: "Quando será divulgada a agenda escolar?", alunoId: 999, status: "Resolvida" },
    });
    assert.equal(firstMessage.status, 201);
    assert.equal(firstMessage.body.mensagem.alunoId, firstStudent.body.user.id);
    assert.equal(firstMessage.body.mensagem.status, "Pendente");
    assert.equal(firstMessage.body.mensagem.tipo, "Pergunta");

    const secondMessage = await request(application, "/api/mensagens", {
      method: "POST",
      cookie: firstStudent.cookie,
      body: { categoria: "reclamacoes", mensagem: "A internet do laboratório está instável." },
    });
    assert.equal(secondMessage.status, 201);

    const foreignMessage = await request(application, "/api/mensagens", {
      method: "POST",
      cookie: secondStudent.cookie,
      body: { categoria: "sugestoes", mensagem: "Sugiro ampliar o horário da biblioteca." },
    });
    assert.equal(foreignMessage.status, 201);

    const history = await request(application, "/api/mensagens", { cookie: firstStudent.cookie });
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.mensagens.map((message) => message.id), [secondMessage.body.mensagem.id, firstMessage.body.mensagem.id]);
    assert.equal(history.body.mensagens.some((message) => message.id === foreignMessage.body.mensagem.id), false);

    const filteredHistory = await request(application, "/api/mensagens?categoria=perguntas&busca=agenda", {
      cookie: firstStudent.cookie,
    });
    assert.equal(filteredHistory.status, 200);
    assert.deepEqual(filteredHistory.body.mensagens.map((message) => message.id), [firstMessage.body.mensagem.id]);

    const storedMessages = JSON.parse(await readFile(application.messagesFile, "utf8"));
    assert.equal(storedMessages.mensagens.length, 3);
    assert.deepEqual(storedMessages.mensagens[0].respostas, []);
  } finally {
    await application.close();
  }
});

test("API de mensagens exige aluno autenticado e valida conteúdo e categoria", async () => {
  const application = await startApplication();
  try {
    const unauthenticated = await request(application, "/api/mensagens", {
      method: "POST",
      body: { categoria: "perguntas", mensagem: "Teste" },
    });
    assert.equal(unauthenticated.status, 401);

    const student = await request(application, "/api/auth/register", { method: "POST", body: validStudent() });
    const blank = await request(application, "/api/mensagens", {
      method: "POST",
      cookie: student.cookie,
      body: { categoria: "perguntas", mensagem: "   " },
    });
    assert.equal(blank.status, 422);
    assert.equal(blank.body.message, "Não é possível enviar uma mensagem vazia.");

    const invalidCategory = await request(application, "/api/mensagens", {
      method: "POST",
      cookie: student.cookie,
      body: { categoria: "administracao", mensagem: "Teste" },
    });
    assert.equal(invalidCategory.status, 422);
    assert.equal(invalidCategory.body.message, "Categoria inválida.");

    const manager = await request(application, "/api/auth/login", {
      method: "POST",
      body: { identidade: "gestor@connectclass.local", senha: application.managerPassword },
    });
    const managerPost = await request(application, "/api/mensagens", {
      method: "POST",
      cookie: manager.cookie,
      body: { categoria: "perguntas", mensagem: "Teste" },
    });
    assert.equal(managerPost.status, 403);
  } finally {
    await application.close();
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
