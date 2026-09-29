import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createMessageRepository } from "../server/messages.js";
import { acquireTestDatabase } from "./mysql-fixture.js";
import test from "node:test";
import { createConnectClassApp } from "../server/app.js";

async function startApplication(reuseDatabase = null, options = {}) {
  const fixture = await acquireTestDatabase({ reset: !reuseDatabase });
  const managerPassword = options.managerPassword ?? `G!${randomBytes(16).toString("base64url")}`;
  let app;
  try {
    app = await createConnectClassApp({ database: fixture.config, managerPassword, logger: { info() {} }, ...options });
    const port = await listen(app.server);
    let closed = false;
    return { ...app, dataDirectory: "connectclass_test", managerPassword, baseUrl: `http://127.0.0.1:${port}`,
      async close() { if (closed) return; closed = true; await app.close(); await fixture.release(); } };
  } catch (error) { await app?.close(); await fixture.release(); throw error; }
}

async function readStoredMessages(app) {
  const data = await createMessageRepository(app.pool).listForManager();
  return { mensagens: data.conversas.flatMap((c) => c.mensagens).sort((a,b) => a.id-b.id) };
}
async function updateFixtureMessages(app, data) {
  for (const m of data.mensagens) {
    await app.pool.execute("UPDATE conversations SET created_at = ?, last_activity_at = ?, status = ? WHERE id = ?", [new Date(m.dataHora),new Date(m.dataHora),m.status,m.id]);
    await app.pool.execute("UPDATE messages SET created_at = ? WHERE conversation_id = ? AND sender_type = 'aluno'", [new Date(m.dataHora),m.id]);
  }
}

async function request(application, path, { method = "GET", body, cookie, redirect = "manual", headers = {} } = {}) {
  const response = await fetch(`${application.baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
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
    cacheControl: response.headers.get("cache-control"),
    retryAfter: response.headers.get("retry-after"),
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

    const [usuarios] = await application.pool.execute("SELECT ra, senha_hash AS senhaHash FROM users");
    const storedUsers = { usuarios };
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

    const messages = await readStoredMessages(secondApplication);
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
    assert.deepEqual(history.body.mensagens.map((message) => message.id), [firstMessage.body.mensagem.id, secondMessage.body.mensagem.id]);
    assert.equal(history.body.mensagens.some((message) => message.id === foreignMessage.body.mensagem.id), false);
    assert.deepEqual(history.body.contadores, { perguntas: 1, reclamacoes: 1, sugestoes: 0 });

    const filteredHistory = await request(application, "/api/mensagens?categoria=perguntas&busca=agenda", {
      cookie: firstStudent.cookie,
    });
    assert.equal(filteredHistory.status, 200);
    assert.deepEqual(filteredHistory.body.mensagens.map((message) => message.id), [firstMessage.body.mensagem.id]);

    const storedMessages = await readStoredMessages(application);
    assert.equal(storedMessages.mensagens.length, 3);
    assert.deepEqual(storedMessages.mensagens[0].respostas, []);
  } finally {
    await application.close();
  }
});

test("gestor deriva dashboard, conversas e filtros a partir das mensagens persistidas", async () => {
  const application = await startApplication();
  try {
    const firstStudent = await request(application, "/api/auth/register", { method: "POST", body: validStudent() });
    const secondStudent = await request(application, "/api/auth/register", {
      method: "POST",
      body: validStudent({
        nome: "Bruno Alves",
        ra: "2026002",
        turma: "2º Ano A",
        email: "bruno.alves@escola.edu.br",
      }),
    });

    const created = [];
    created.push(await request(application, "/api/mensagens", {
      method: "POST",
      cookie: firstStudent.cookie,
      body: { categoria: "Pergunta", mensagem: "Calendário da escola" },
    }));
    created.push(await request(application, "/api/mensagens", {
      method: "POST",
      cookie: firstStudent.cookie,
      body: { categoria: "reclamacoes", mensagem: "Laboratório sem internet" },
    }));
    created.push(await request(application, "/api/mensagens", {
      method: "POST",
      cookie: secondStudent.cookie,
      body: { categoria: "sugestoes", mensagem: "Biblioteca aberta aos sábados" },
    }));
    created.push(await request(application, "/api/mensagens", {
      method: "POST",
      cookie: secondStudent.cookie,
      body: { categoria: "perguntas", mensagem: "Agenda de provas" },
    }));
    created.push(await request(application, "/api/mensagens", {
      method: "POST",
      cookie: firstStudent.cookie,
      body: { categoria: "perguntas", mensagem: "Reunião de pais" },
    }));
    created.forEach((response) => assert.equal(response.status, 201));

    const persisted = await readStoredMessages(application);
    const dates = ["2026-01-10T10:00:00.000Z", "2026-01-11T10:00:00.000Z", "2026-02-01T10:00:00.000Z", "2026-03-15T10:00:00.000Z", "2026-04-01T10:00:00.000Z"];
    const statuses = ["Pendente", "Respondida", "Resolvida", "Em análise", "Pendente"];
    persisted.mensagens.forEach((message, index) => {
      message.dataHora = dates[index];
      message.status = statuses[index];
    });
    await updateFixtureMessages(application, persisted);

    const managerLogin = await request(application, "/api/auth/login", {
      method: "POST",
      body: { identidade: "gestor@connectclass.local", senha: application.managerPassword },
    });
    assert.equal(managerLogin.status, 200);

    const deniedWithoutSession = await request(application, "/api/gestor");
    assert.equal(deniedWithoutSession.status, 401);
    const deniedStudent = await request(application, "/api/gestor", { cookie: firstStudent.cookie });
    assert.equal(deniedStudent.status, 403);

    const dashboard = await request(application, "/api/gestor", { cookie: managerLogin.cookie });
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.body.dashboard, {
      total: 5,
      pendentes: 2,
      emAnalise: 1,
      respondidas: 1,
      resolvidas: 1,
      perguntas: 3,
      reclamacoes: 1,
      sugestoes: 1,
    });
    assert.equal(dashboard.body.conversas.length, 4);
    assert.equal(dashboard.body.conversas[0].tipo, "Pergunta");
    assert.equal(dashboard.body.conversas[0].aluno.id, firstStudent.body.user.id);
    assert.deepEqual(
      dashboard.body.conversas[0].mensagens.map((message) => message.mensagem),
      ["Calendário da escola", "Reunião de pais"]
    );
    assert.equal("senhaHash" in dashboard.body.user, false);

    const perguntas = await request(application, "/api/gestor?categoria=perguntas", { cookie: managerLogin.cookie });
    assert.equal(perguntas.status, 200);
    assert.equal(perguntas.body.conversas.length, 2);
    assert.ok(perguntas.body.conversas.every((conversation) => conversation.tipo === "Pergunta"));

    const reclamacoes = await request(application, "/api/gestor?categoria=reclamacoes", { cookie: managerLogin.cookie });
    assert.equal(reclamacoes.body.conversas.length, 1);
    assert.equal(reclamacoes.body.conversas[0].tipo, "Reclamação");

    const sugestoes = await request(application, "/api/gestor?categoria=sugestoes", { cookie: managerLogin.cookie });
    assert.equal(sugestoes.body.conversas.length, 1);
    assert.equal(sugestoes.body.conversas[0].tipo, "Sugestão");

    const bySearch = await request(application, "/api/gestor?busca=biblioteca", { cookie: managerLogin.cookie });
    assert.equal(bySearch.body.conversas.length, 1);
    assert.equal(bySearch.body.conversas[0].aluno.nome, "Bruno Alves");

    const byStudent = await request(application, `/api/gestor?alunoId=${firstStudent.body.user.id}`, { cookie: managerLogin.cookie });
    assert.equal(byStudent.body.conversas.length, 2);
    assert.ok(byStudent.body.conversas.every((conversation) => conversation.aluno.id === firstStudent.body.user.id));

    const byClass = await request(application, "/api/gestor?turma=2%C2%BA%20Ano%20A", { cookie: managerLogin.cookie });
    assert.equal(byClass.body.conversas.length, 2);
    assert.ok(byClass.body.conversas.every((conversation) => conversation.aluno.turma === "2º Ano A"));

    const byStatus = await request(application, "/api/gestor?status=Respondida", { cookie: managerLogin.cookie });
    assert.equal(byStatus.body.conversas.length, 1);
    assert.equal(byStatus.body.conversas[0].status, "Respondida");

    const byDate = await request(application, "/api/gestor?dataInicial=2026-02-01&dataFinal=2026-02-28", { cookie: managerLogin.cookie });
    assert.equal(byDate.body.conversas.length, 1);
    assert.equal(byDate.body.conversas[0].tipo, "Sugestão");

    const combined = await request(application, "/api/gestor?turma=3%C2%BA%20Ano%20B&categoria=reclamacoes&status=Respondida&busca=laborat%C3%B3rio", {
      cookie: managerLogin.cookie,
    });
    assert.equal(combined.body.conversas.length, 1);
    assert.equal(combined.body.conversas[0].ultimaMensagem, "Laboratório sem internet");

    const firstStudentHistory = await request(application, "/api/mensagens?categoria=perguntas&busca=reuni%C3%A3o", {
      cookie: firstStudent.cookie,
    });
    assert.deepEqual(firstStudentHistory.body.mensagens.map((message) => message.mensagem), ["Reunião de pais"]);
    assert.deepEqual(firstStudentHistory.body.contadores, { perguntas: 2, reclamacoes: 1, sugestoes: 0 });

    const attemptedEscalation = await request(application, `/api/mensagens?alunoId=${secondStudent.body.user.id}&categoria=todos`, {
      cookie: firstStudent.cookie,
    });
    assert.equal(attemptedEscalation.status, 200);
    assert.equal(attemptedEscalation.body.mensagens.some((message) => message.alunoId === secondStudent.body.user.id), false);

    const storedAgain = await readStoredMessages(application);
    assert.equal(storedAgain.mensagens.length, 5);
    assert.ok(storedAgain.mensagens.every((message) => Array.isArray(message.respostas)));
    assert.equal((await request(application, "/api/gestor?categoria=invalida", { cookie: managerLogin.cookie })).status, 422);
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

test("fluxo completo persiste resposta e status, invalida logout e conserva dados após reinício", async () => {
  const first = await startApplication();
  let restarted;
  try {
    const student = await request(first, "/api/auth/register", { method: "POST", body: validStudent() });
    const sent = await request(first, "/api/mensagens", {
      method: "POST", cookie: student.cookie,
      body: { categoria: "reclamacoes", mensagem: "O laboratório está fechado.\nQual é o novo horário?" },
    });
    const id = sent.body.mensagem.id;
    const manager = await managerSession(first);
    const analyzing = await request(first, `/api/gestor/mensagens/${id}/status`, {
      method: "PATCH", cookie: manager.cookie, body: { status: "Em análise", alunoId: 999 },
    });
    assert.equal(analyzing.status, 200);
    assert.equal(analyzing.body.mensagem.status, "Em análise");
    const reply = await request(first, `/api/gestor/mensagens/${id}/respostas`, {
      method: "POST", cookie: manager.cookie,
      body: { mensagem: "O laboratório abrirá às 9h.\nProcure a coordenação.", gestorId: 999, nomeGestor: "Impostor", mensagemId: 999 },
    });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.mensagem.status, "Respondida");
    assert.equal(reply.body.resposta.gestorId, manager.body.user.id);
    assert.equal(reply.body.resposta.nomeGestor, manager.body.user.nome);
    assert.equal(reply.body.resposta.mensagemId, id);
    assert.ok(Number.isFinite(Date.parse(reply.body.resposta.dataHora)));
    assert.equal(reply.body.mensagem.alunoId, student.body.user.id);
    const resolved = await request(first, `/api/gestor/mensagens/${id}/status`, {
      method: "PATCH", cookie: manager.cookie, body: { status: "Resolvida" },
    });
    assert.equal(resolved.body.mensagem.status, "Resolvida");
    const before = await request(first, "/api/mensagens?categoria=reclamacoes&busca=coordena%C3%A7%C3%A3o", { cookie: student.cookie });
    assert.equal(before.body.mensagens[0].respostas[0].mensagem, reply.body.resposta.mensagem);
    assert.equal(before.body.mensagens[0].mensagem, sent.body.mensagem.mensagem);
    const logout = await request(first, "/api/auth/logout", { method: "POST", cookie: student.cookie });
    assert.equal(logout.status, 200);
    assert.match(logout.setCookie, /Max-Age=0/);
    assert.match(logout.setCookie, /HttpOnly/);
    assert.equal((await request(first, "/api/auth/me", { cookie: student.cookie })).status, 401);
    assert.equal((await request(first, "/api/mensagens", { cookie: student.cookie })).status, 401);
    assert.equal((await request(first, "/aluno", { cookie: student.cookie })).location, "/login");
    assert.equal((await request(first, "/api/auth/logout", { method: "POST", cookie: student.cookie })).status, 200);
    await first.close({ removeData: false });
    restarted = await startApplication(first.dataDirectory, { managerPassword: first.managerPassword });
    assert.equal((await request(restarted, "/api/gestor", { cookie: manager.cookie })).status, 401);
    const again = await request(restarted, "/api/auth/login", {
      method: "POST", body: { identidade: validStudent().ra, senha: validStudent().senha },
    });
    assert.equal(again.status, 200);
    const persisted = await request(restarted, "/api/mensagens?categoria=reclamacoes", { cookie: again.cookie });
    assert.deepEqual(persisted.body.mensagens, before.body.mensagens);
    const managerAgain = await managerSession(restarted);
    const dashboard = await request(restarted, "/api/gestor", { cookie: managerAgain.cookie });
    assert.equal(dashboard.body.dashboard.resolvidas, 1);
    assert.equal(dashboard.body.dashboard.pendentes, 0);
    assert.equal(dashboard.body.conversas[0].ultimaMensagem, reply.body.resposta.mensagem);
    assert.equal(dashboard.body.conversas[0].ultimaAtividade, reply.body.resposta.dataHora);
  } finally {
    if (restarted) await restarted.close();
    else await first.close();
  }
});

test("respostas e status são exclusivos do gestor e não atravessam históricos de alunos", async () => {
  const app = await startApplication();
  try {
    const student = await request(app, "/api/auth/register", { method: "POST", body: validStudent() });
    const other = await request(app, "/api/auth/register", {
      method: "POST", body: validStudent({ ra: "2026002", email: "bruno@escola.edu.br" }),
    });
    const sent = await request(app, "/api/mensagens", {
      method: "POST", cookie: student.cookie, body: { categoria: "perguntas", mensagem: "Horário?" },
    });
    const id = sent.body.mensagem.id;
    for (const [method, suffix, body] of [["PATCH", "status", { status: "Resolvida" }], ["POST", "respostas", { mensagem: "Resposta" }]]) {
      const path = `/api/gestor/mensagens/${id}/${suffix}`;
      assert.equal((await request(app, path, { method, body })).status, 401);
      for (const cookie of [student.cookie, other.cookie]) {
        assert.equal((await request(app, path, { method, body, cookie })).status, 403);
      }
    }
    const manager = await managerSession(app);
    const response = await request(app, `/api/gestor/mensagens/${id}/respostas`, {
      method: "POST", cookie: manager.cookie, body: { mensagem: '<script>alert("teste")</script>' },
    });
    assert.equal(response.status, 201);
    const own = await request(app, "/api/mensagens", { cookie: student.cookie });
    assert.equal(own.body.mensagens[0].respostas[0].mensagem, '<script>alert("teste")</script>');
    const foreign = await request(app, `/api/mensagens?alunoId=${student.body.user.id}`, { cookie: other.cookie });
    assert.deepEqual(foreign.body.mensagens, []);
    assert.equal((await request(app, "/api/gestor/mensagens/99999/status", {
      method: "PATCH", cookie: manager.cookie, body: { status: "Pendente" },
    })).status, 404);
    assert.equal((await request(app, "/api/gestor/mensagens/99999/respostas", {
      method: "POST", cookie: manager.cookie, body: { mensagem: "Resposta" },
    })).status, 404);
    assert.equal((await request(app, "/api/auth/logout", { method: "POST", cookie: manager.cookie })).status, 200);
    assert.equal((await request(app, `/api/gestor/mensagens/${id}/status`, {
      method: "PATCH", cookie: manager.cookie, body: { status: "Resolvida" },
    })).status, 401);
  } finally { await app.close(); }
});

test("validação rejeita tipos incorretos, categorias herdadas, status e identificadores inválidos", async () => {
  const app = await startApplication();
  try {
    for (const field of ["nome", "ra", "turma", "email"]) {
      for (const value of [123, {}, ["valor"]]) {
        const result = await request(app, "/api/auth/register", { method: "POST", body: validStudent({ [field]: value }) });
        assert.equal(result.status, 422, `${field}: ${JSON.stringify(value)}`);
        assert.ok(result.body.fields[field]);
      }
    }
    const student = await request(app, "/api/auth/register", { method: "POST", body: validStudent() });
    for (const categoria of ["toString", "__proto__", "constructor", {}, 12]) {
      assert.equal((await request(app, "/api/mensagens", {
        method: "POST", cookie: student.cookie, body: { categoria, mensagem: "Teste" },
      })).status, 422);
    }
    const sent = await request(app, "/api/mensagens", {
      method: "POST", cookie: student.cookie, body: { categoria: "sugestoes", mensagem: "Mais livros" },
    });
    const id = sent.body.mensagem.id;
    const manager = await managerSession(app);
    for (const mensagem of [" ", {}, 123, "a".repeat(1001)]) {
      assert.equal((await request(app, "/api/mensagens", {
        method: "POST", cookie: student.cookie, body: { categoria: "perguntas", mensagem },
      })).status, 422);
      assert.equal((await request(app, `/api/gestor/mensagens/${id}/respostas`, {
        method: "POST", cookie: manager.cookie, body: { mensagem },
      })).status, 422);
    }
    for (const status of ["", "Concluída", {}, 1, null]) {
      assert.equal((await request(app, `/api/gestor/mensagens/${id}/status`, {
        method: "PATCH", cookie: manager.cookie, body: { status },
      })).status, 422);
    }
    for (const invalidId of ["0", "-1", "1.5", "NaN", "9007199254740992"]) {
      assert.equal((await request(app, `/api/gestor/mensagens/${invalidId}/status`, {
        method: "PATCH", cookie: manager.cookie, body: { status: "Pendente" },
      })).status, 422);
    }
    for (const query of ["categoria=toString", "status=invalido", "alunoId=0", "dataInicial=2026-02-30", "dataInicial=2026-03-01&dataFinal=2026-02-01"]) {
      assert.equal((await request(app, `/api/gestor?${query}`, { cookie: manager.cookie })).status, 422);
    }
    assert.equal((await request(app, "/api/auth/login", {
      method: "POST", body: { identidade: 2026001, senha: validStudent().senha },
    })).status, 401);
    assert.equal((await request(app, "/api/auth/login", {
      method: "POST", body: { identidade: validStudent().ra, senha: "x".repeat(129) },
    })).status, 401);
    const stored = await readStoredMessages(app);
    assert.equal(stored.mensagens.length, 1);
    assert.equal(stored.mensagens[0].status, "Pendente");
    assert.deepEqual(stored.mensagens[0].respostas, []);
  } finally { await app.close(); }
});

test("origem e JSON são verificados, páginas privadas não usam cache e arquivos sensíveis não são servidos", async () => {
  const app = await startApplication();
  try {
    const student = await request(app, "/api/auth/register", {
      method: "POST", body: validStudent(), headers: { Origin: app.baseUrl },
    });
    const manager = await managerSession(app);
    for (const [method, path, cookie, body] of [
      ["POST", "/api/auth/register", null, validStudent()],
      ["POST", "/api/auth/login", null, { identidade: validStudent().ra, senha: validStudent().senha }],
      ["POST", "/api/auth/logout", student.cookie, {}],
      ["POST", "/api/mensagens", student.cookie, { categoria: "perguntas", mensagem: "Teste" }],
      ["PATCH", "/api/gestor/mensagens/1/status", manager.cookie, { status: "Resolvida" }],
      ["POST", "/api/gestor/mensagens/1/respostas", manager.cookie, { mensagem: "Teste" }],
    ]) {
      assert.equal((await request(app, path, { method, cookie, body, headers: { Origin: "https://site-externo.example" } })).status, 403);
      assert.equal((await request(app, path, { method, cookie, body, headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    }
    assert.equal((await request(app, "/api/auth/me", { cookie: student.cookie })).status, 200);
    assert.equal((await request(app, "/api/mensagens", {
      method: "POST", cookie: student.cookie, body: { categoria: "perguntas", mensagem: "Teste" },
      headers: { "Content-Type": "text/plain" },
    })).status, 415);
    assert.equal((await request(app, "/api/mensagens", {
      method: "POST", cookie: student.cookie, body: { categoria: "perguntas", mensagem: "x".repeat(20_000) },
    })).status, 413);
    const invalidJson = await fetch(`${app.baseUrl}/api/mensagens`, {
      method: "POST", headers: { Cookie: student.cookie, "Content-Type": "application/json" }, body: "{",
    });
    assert.equal(invalidJson.status, 400);
    await invalidJson.text();
    for (const [path, cookie] of [["/aluno", student.cookie], ["/gestor", manager.cookie], ["/aluno", null], ["/gestor", student.cookie]]) {
      assert.equal((await request(app, path, { cookie })).cacheControl, "no-store");
    }
    for (const path of ["/data/usuarios.json", "/data/mensagens.json", "/server/users.js", "/.env", "/%2e%2e/server.js", "/toString"]) {
      assert.equal((await request(app, path)).status, 404);
    }
    const rotated = await request(app, "/api/auth/login", {
      method: "POST", cookie: student.cookie, body: { identidade: validStudent().ra, senha: validStudent().senha },
    });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.cookie, student.cookie);
    assert.equal((await request(app, "/api/auth/me", { cookie: student.cookie })).status, 401);
  } finally { await app.close(); }
});

test("gravações concorrentes conservam mensagens, respostas e unicidade de cadastro", async () => {
  const app = await startApplication();
  try {
    const registrations = await Promise.all(Array.from({ length: 3 }, () => request(app, "/api/auth/register", {
      method: "POST", body: validStudent(),
    })));
    assert.deepEqual(registrations.map((entry) => entry.status).sort(), [201, 409, 409]);
    const student = registrations.find((entry) => entry.status === 201);
    const sent = await Promise.all(Array.from({ length: 12 }, (_, index) => request(app, "/api/mensagens", {
      method: "POST", cookie: student.cookie, body: { categoria: "perguntas", mensagem: `Pergunta ${index}` },
    })));
    assert.ok(sent.every((entry) => entry.status === 201));
    assert.equal(new Set(sent.map((entry) => entry.body.mensagem.id)).size, 12);
    const manager = await managerSession(app);
    const target = sent[0].body.mensagem.id;
    const replies = await Promise.all(Array.from({ length: 8 }, (_, index) => request(app, `/api/gestor/mensagens/${target}/respostas`, {
      method: "POST", cookie: manager.cookie, body: { mensagem: `Retorno ${index}` },
    })));
    assert.ok(replies.every((entry) => entry.status === 201));
    assert.equal(new Set(replies.map((entry) => entry.body.resposta.id)).size, 8);
    const stored = await readStoredMessages(app);
    assert.equal(stored.mensagens.length, 12);
    assert.equal(stored.mensagens.find((entry) => entry.id === target).respostas.length, 8);
    const dashboard = await request(app, "/api/gestor", { cookie: manager.cookie });
    assert.equal(dashboard.body.dashboard.total, 12);
    assert.equal(dashboard.body.dashboard.respondidas, 1);
    assert.equal(dashboard.body.dashboard.pendentes, 11);
    assert.match(dashboard.body.conversas[0].ultimaMensagem, /^Retorno /);
  } finally { await app.close(); }
});

test("filtros de dia usam Brasília e mantêm histórico completo identificando mensagens correspondentes", async () => {
  const app = await startApplication();
  try {
    const student = await request(app, "/api/auth/register", { method: "POST", body: validStudent() });
    for (const mensagem of ["Antes do dia", "Início do dia", "Fim do dia", "Depois do dia"]) {
      await request(app, "/api/mensagens", { method: "POST", cookie: student.cookie, body: { categoria: "perguntas", mensagem } });
    }
    const data = await readStoredMessages(app);
    const dates = ["2026-09-05T02:59:59.999Z", "2026-09-05T03:00:00.000Z", "2026-09-06T02:59:59.999Z", "2026-09-06T03:00:00.000Z"];
    data.mensagens.forEach((message, index) => { message.dataHora = dates[index]; });
    data.mensagens[3].status = "Resolvida";
    await updateFixtureMessages(app, data);
    const manager = await managerSession(app);
    const filtered = await request(app, "/api/gestor?dataInicial=2026-09-05&dataFinal=2026-09-05", { cookie: manager.cookie });
    assert.equal(filtered.body.conversas.length, 1);
    assert.deepEqual(filtered.body.conversas[0].mensagensCorrespondentes, data.mensagens.slice(1,3).map((m)=>m.id));
    assert.equal(filtered.body.conversas[0].mensagens.length, 4);
    const pending = await request(app, "/api/gestor?status=Pendente", { cookie: manager.cookie });
    assert.deepEqual(pending.body.conversas[0].mensagensCorrespondentes, data.mensagens.slice(0,3).map((m)=>m.id));
  } finally { await app.close(); }
});

test("limite de autenticação retorna 429 e senha configurada não aparece no log", async () => {
  const logs = [];
  const app = await startApplication(null, { authRateLimit: 3, logger: { info: (line) => logs.push(line) } });
  try {
    assert.equal(logs.join("\n").includes(app.managerPassword), false);
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await request(app, "/api/auth/login", {
        method: "POST", body: { identidade: "inexistente", senha: "SenhaErrada!1" },
      })).status, 401);
    }
    const limited = await request(app, "/api/auth/login", {
      method: "POST", body: { identidade: "inexistente", senha: "SenhaErrada!1" },
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.retryAfter, "60");
  } finally { await app.close(); }
});

test("runtime MySQL rejeita opção antiga de diretório JSON sem ler arquivos", async () => {
  await assert.rejects(createConnectClassApp({ dataDirectory: "nao-ler-json" }), /JSON desativada/);
});

async function managerSession(app) {
  const result = await request(app, "/api/auth/login", {
    method: "POST", body: { identidade: "gestor@connectclass.local", senha: app.managerPassword },
  });
  assert.equal(result.status, 200);
  return result;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

test("corpos incompletos não ocupam vagas globais de senha", async () => {
  const app = await startApplication();
  const pending = [];
  try {
    for (const path of ["login", "register", "login", "register"]) {
      const received = new Promise((resolve) => app.server.once("request", resolve));
      const slow = httpRequest(`${app.baseUrl}/api/auth/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      });
      slow.on("error", () => {});
      slow.write("{");
      pending.push(slow);
      await received;
    }
    const login = await request(app, "/api/auth/login", {
      method: "POST", body: { identidade: "gestor@connectclass.local", senha: app.managerPassword },
    });
    assert.equal(login.status, 200);
  } finally {
    pending.forEach((req) => req.destroy());
    app.server.closeAllConnections();
    await app.close();
  }
});

test("corpo incompleto expira com 408 sem deixar a conexão aberta", async () => {
  const app = await startApplication(null, { bodyTimeoutMs: 50 });
  let slow;
  try {
    const status = await new Promise((resolve, reject) => {
      slow = httpRequest(`${app.baseUrl}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "100" },
      }, (response) => { response.resume(); resolve(response.statusCode); });
      slow.on("error", reject);
      slow.setTimeout(2000, () => { slow.destroy(); reject(new Error("Leitura não expirou.")); });
      slow.write("{");
    });
    assert.equal(status, 408);
  } finally {
    slow?.destroy();
    app.server.closeAllConnections();
    await app.close();
  }
});

test("health e assets têm status, MIME e cabeçalhos esperados sem expor dados", async () => {
  const app = await startApplication();
  try {
    const health = await request(app, "/health");
    assert.deepEqual(health.body, { status: "ok" });
    assert.equal(health.status, 200);
    for (const [path, mime] of [["/login", "text/html"], ["/styles.css", "text/css"], ["/manager.css", "text/css"], ["/script.js", "application/javascript"], ["/gestor.js", "application/javascript"], ["/message-ui.js", "application/javascript"], ["/assets/connectclass-logo.png", "image/png"]]) {
      const response = await fetch(app.baseUrl + path);
      assert.equal(response.status, 200, path);
      assert.ok(response.headers.get("content-type").startsWith(mime), path);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
    assert.equal((await request(app, "/Captura%20de%20tela%20de%202026-06-07%2023-06-40.png")).status, 404);
  } finally { await app.close(); }
});

test("produção usa cookie Secure e exige a origem HTTPS do Host público", async () => {
  const app = await startApplication(null, { isProduction: true });
  try {
    const payload = { identidade: "gestor@connectclass.local", senha: app.managerPassword };
    const rejected = await request(app, "/api/auth/login", { method: "POST", body: payload, headers: { Origin: app.baseUrl } });
    assert.equal(rejected.status, 403);
    const login = await request(app, "/api/auth/login", { method: "POST", body: payload, headers: { Origin: app.baseUrl.replace("http:", "https:") } });
    assert.equal(login.status, 200);
    assert.match(login.setCookie, /; Secure/);
  } finally { await app.close(); }
});
