import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMessageRepository, MessageNotFoundError, MessageValidationError } from "./messages.js";
import { createUserRepository, ConflictError, publicUser, ValidationError } from "./users.js";
import { createSessionStore, readCookies, serializeSessionCookie, SESSION_COOKIE } from "./sessions.js";
import { createDatabasePool, databaseConfig, safeDatabaseError } from "./database/connection.js";
import { verifySchema } from "./database/migrations.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = join(moduleDirectory, "..");
const REGULAR_SESSION_TTL = 8 * 60 * 60 * 1_000;
const REMEMBERED_SESSION_TTL = 7 * 24 * 60 * 60 * 1_000;
const MAX_BODY_SIZE = 16 * 1024;

const publicFiles = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/login": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/script.js": { file: "script.js", contentType: "application/javascript; charset=utf-8" },
  "/gestor.js": { file: "gestor.js", contentType: "application/javascript; charset=utf-8" },
  "/message-ui.js": { file: "message-ui.js", contentType: "application/javascript; charset=utf-8" },
  "/manager.css": { file: "manager.css", contentType: "text/css; charset=utf-8" },
  "/assets/logo.png": { file: "assets/logo.png", contentType: "image/png" },
  "/Captura%20de%20tela%20de%202026-06-07%2023-06-40.png": { file: "Captura de tela de 2026-06-07 23-06-40.png", contentType: "image/png" },
};

export async function createConnectClassApp(options = {}) {
  const publicDirectory = options.publicDirectory ?? defaultPublicDirectory;
  if (options.dataDirectory !== undefined) throw new Error("Persistência JSON desativada. Configure MySQL.");
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  const logger = options.logger ?? console;
  const pool = createDatabasePool(options.database ?? databaseConfig());
  const users = createUserRepository(pool);
  const messages = createMessageRepository(pool);
  const sessions = createSessionStore({
    regularTtlMs: options.regularSessionTtlMs ?? REGULAR_SESSION_TTL,
    rememberedTtlMs: options.rememberedSessionTtlMs ?? REMEMBERED_SESSION_TTL,
  });
  const authLimiter = createAuthLimiter(options.authRateLimit ?? 30, options.authRateWindowMs ?? 60_000);

  try {
  await verifySchema(pool);
  await users.initialize();
  await messages.initialize();

  const configuredManagerPassword = options.managerPassword ?? process.env.CONNECTCLASS_GESTOR_PASSWORD;
  const createdManager = await users.ensureInitialManager(configuredManagerPassword);
  if (createdManager) {
    logger.info("[ConnectClass] Gestor local inicial criado.");
    logger.info("[ConnectClass] E-mail: gestor@connectclass.local");
  }
  } catch (error) { await pool.end(); throw error; }

  const server = createServer({ headersTimeout: 10_000, requestTimeout: 20_000, connectionsCheckingInterval: 1_000 }, async (request, response) => {
    try {
      await handleRequest({ request, response, users, messages, sessions, authLimiter, publicDirectory, isProduction, bodyTimeoutMs: options.bodyTimeoutMs ?? 10_000 });
    } catch (error) {
      logger.error?.("[ConnectClass] Erro inesperado:", safeDatabaseError(error));
      sendJson(response, 500, { message: "Não foi possível concluir a operação. Tente novamente." });
    }
  });

  let closed = false;
  return { server, pool, async close() {
    if (closed) return;
    closed = true;
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  } };
}

async function handleRequest(context) {
  const { request, response } = context;
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  applySecurityHeaders(response);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { status: "ok" });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    return handleRegistration(context);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    return handleLogin(context);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!hasAllowedOrigin(request, context.isProduction)) {
      return sendJson(response, 403, { message: "Origem da requisição não permitida." });
    }
    context.sessions.destroy(readCookies(request.headers.cookie)[SESSION_COOKIE]);
    response.setHeader("Set-Cookie", serializeSessionCookie("", 0, context.isProduction));
    return sendJson(response, 200, { message: "Sessão encerrada." });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await authenticatedUser(context);
    if (!user) return sendJson(response, 401, { message: "Sessão inválida ou expirada." });
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (request.method === "GET" && url.pathname === "/api/aluno") {
    return protectedApi(context, "aluno");
  }

  if (request.method === "GET" && url.pathname === "/api/gestor") {
    return listManagerMessages(context, url);
  }

  if (request.method === "GET" && url.pathname === "/api/mensagens") {
    return listStudentMessages(context, url);
  }

  if (request.method === "POST" && url.pathname === "/api/mensagens") {
    return createStudentMessage(context);
  }

  const managerMutation = /^\/api\/gestor\/mensagens\/([^/]+)\/(status|respostas)$/.exec(url.pathname);
  if (managerMutation && ((request.method === "PATCH" && managerMutation[2] === "status") ||
      (request.method === "POST" && managerMutation[2] === "respostas"))) {
    return mutateManagerMessage(context, managerMutation[1], managerMutation[2]);
  }

  if (request.method === "GET" && url.pathname === "/aluno") {
    return protectedPage(context, "aluno", "index.html");
  }

  if (request.method === "GET" && url.pathname === "/gestor") {
    return protectedPage(context, "gestor", "gestor.html");
  }

  if (request.method === "GET" && Object.hasOwn(publicFiles, url.pathname)) {
    return sendFile(response, join(context.publicDirectory, publicFiles[url.pathname].file), publicFiles[url.pathname].contentType);
  }

  sendJson(response, 404, { message: "Rota não encontrada." });
}

async function listStudentMessages(context, url) {
  const user = await authenticatedUser(context);
  if (!user) return sendJson(context.response, 401, { message: "Não autenticado." });
  if (user.tipo !== "aluno") return sendJson(context.response, 403, { message: "Acesso negado." });

  try {
    const history = await context.messages.getStudentHistory(user.id, {
      categoria: url.searchParams.get("categoria") ?? "todos",
      busca: url.searchParams.get("busca") ?? "",
    });
    return sendJson(context.response, 200, history);
  } catch (error) {
    return sendKnownError(context.response, error);
  }
}

async function listManagerMessages(context, url) {
  const user = await authenticatedUser(context);
  if (!user) return sendJson(context.response, 401, { message: "Autenticação necessária." });
  if (user.tipo !== "gestor") {
    return sendJson(context.response, 403, { message: "Você não tem permissão para acessar este recurso." });
  }

  try {
    const payload = await context.messages.listForManager(
      {
        categoria: url.searchParams.get("categoria"),
        status: url.searchParams.get("status"),
        alunoId: url.searchParams.get("alunoId"),
        turma: url.searchParams.get("turma"),
        busca: url.searchParams.get("busca"),
        dataInicial: url.searchParams.get("dataInicial"),
        dataFinal: url.searchParams.get("dataFinal"),
      }
    );
    return sendJson(context.response, 200, { user: publicUser(user), ...payload });
  } catch (error) {
    return sendKnownError(context.response, error);
  }
}

async function createStudentMessage(context) {
  const { request, response } = context;
  if (!hasAllowedOrigin(request, context.isProduction)) {
    return sendJson(response, 403, { message: "Origem da requisição não permitida." });
  }

  const user = await authenticatedUser(context);
  if (!user) return sendJson(response, 401, { message: "Não autenticado." });
  if (user.tipo !== "aluno") return sendJson(response, 403, { message: "Acesso negado." });

  try {
    const body = await readRequestBody(request, context.bodyTimeoutMs);
    const mensagem = await context.messages.createForStudent(user, body);
    return sendJson(response, 201, { mensagem });
  } catch (error) {
    return sendKnownError(response, error);
  }
}

async function mutateManagerMessage(context, rawMessageId, action) {
  const { request, response } = context;
  if (!hasAllowedOrigin(request, context.isProduction)) {
    return sendJson(response, 403, { message: "Origem da requisição não permitida." });
  }
  const user = await authenticatedUser(context);
  if (!user) return sendJson(response, 401, { message: "Autenticação necessária." });
  if (user.tipo !== "gestor") return sendJson(response, 403, { message: "Acesso negado." });
  const messageId = Number(rawMessageId);
  if (!/^[1-9]\d*$/.test(rawMessageId) || !Number.isSafeInteger(messageId)) {
    return sendJson(response, 422, { message: "Identificador de mensagem inválido." });
  }
  try {
    const body = await readRequestBody(request, context.bodyTimeoutMs);
    if (action === "status") {
      const mensagem = await context.messages.updateStatus(messageId, body.status);
      return sendJson(response, 200, { mensagem });
    }
    return sendJson(response, 201, await context.messages.reply(messageId, user, body));
  } catch (error) {
    return sendKnownError(response, error);
  }
}

async function handleRegistration(context) {
  const { request, response, users } = context;
  if (!hasAllowedOrigin(request, context.isProduction)) {
    return sendJson(response, 403, { message: "Origem da requisição não permitida." });
  }

  if (!allowAuthenticationAttempt(context)) return;
  let reserved = false;
  try {
    const body = await readRequestBody(request, context.bodyTimeoutMs);
    reserved = reservePasswordWork(context);
    if (!reserved) return;
    const user = await users.createStudent({
      nome: body.nome,
      ra: body.ra,
      turma: body.turma,
      email: body.email,
      senha: body.senha,
      confirmacaoSenha: body.confirmacaoSenha,
    });
    context.sessions.destroy(readCookies(request.headers.cookie)[SESSION_COOKIE]);
    const session = context.sessions.create(user.id, false);
    response.setHeader("Set-Cookie", serializeSessionCookie(session.token, session.expiresAt, context.isProduction));
    return sendJson(response, 201, { user });
  } catch (error) {
    return sendKnownError(response, error);
  } finally {
    if (reserved) context.authLimiter.release();
  }
}

async function handleLogin(context) {
  const { request, response, users } = context;
  if (!hasAllowedOrigin(request, context.isProduction)) {
    return sendJson(response, 403, { message: "Origem da requisição não permitida." });
  }

  if (!allowAuthenticationAttempt(context)) return;
  let reserved = false;
  try {
    const body = await readRequestBody(request, context.bodyTimeoutMs);
    reserved = reservePasswordWork(context);
    if (!reserved) return;
    const user = await users.authenticate(body.identidade, body.senha);
    if (!user) {
      return sendJson(response, 401, { message: "RA/e-mail ou senha inválidos." });
    }

    context.sessions.destroy(readCookies(request.headers.cookie)[SESSION_COOKIE]);
    const session = context.sessions.create(user.id, body.lembrarMe === true);
    response.setHeader("Set-Cookie", serializeSessionCookie(session.token, session.expiresAt, context.isProduction));
    return sendJson(response, 200, { user: publicUser(user) });
  } catch (error) {
    return sendKnownError(response, error);
  } finally {
    if (reserved) context.authLimiter.release();
  }
}

async function protectedApi(context, requiredType) {
  const user = await authenticatedUser(context);
  if (!user) return sendJson(context.response, 401, { message: "Autenticação necessária." });
  if (user.tipo !== requiredType) return sendJson(context.response, 403, { message: "Você não tem permissão para acessar este recurso." });
  return sendJson(context.response, 200, { user: publicUser(user) });
}

async function protectedPage(context, requiredType, file) {
  context.response.setHeader("Cache-Control", "no-store");
  const user = await authenticatedUser(context);
  if (!user) {
    context.response.writeHead(302, { Location: "/login" });
    context.response.end();
    return;
  }
  if (user.tipo !== requiredType) {
    return sendHtml(context.response, 403, "Acesso negado", "Você não tem permissão para acessar esta área.");
  }
  return sendFile(context.response, join(context.publicDirectory, file), "text/html; charset=utf-8");
}

async function authenticatedUser({ request, users, sessions }) {
  const cookies = readCookies(request.headers.cookie);
  const session = sessions.get(cookies[SESSION_COOKIE]);
  if (!session) return null;
  return users.findById(session.userId);
}

async function sendFile(response, filePath, contentType) {
  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentType,
      ...(contentType.startsWith("text/html") ? { "Cache-Control": "no-store" } : {}),
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { message: "Arquivo não encontrado." });
  }
}

function sendKnownError(response, error) {
  if (error instanceof ValidationError) {
    return sendJson(response, 422, { message: "Revise os campos informados.", fields: error.details });
  }
  if (error instanceof ConflictError) {
    const messages = { ra: "Este RA já está cadastrado.", email: "Este e-mail já está cadastrado." };
    return sendJson(response, 409, { message: messages[error.field], fields: { [error.field]: messages[error.field] } });
  }
  if (error instanceof RequestBodyError) {
    if (error.status === 408 || error.status === 413) response.setHeader("Connection", "close");
    return sendJson(response, error.status, { message: error.message });
  }
  if (error instanceof MessageNotFoundError) {
    return sendJson(response, 404, { message: error.message });
  }
  if (error instanceof MessageValidationError) {
    return sendJson(response, 422, { message: error.message });
  }

  console.error("[ConnectClass] Erro de requisição:", safeDatabaseError(error));
  return sendJson(response, 500, { message: "Não foi possível concluir a operação. Tente novamente." });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, status, title, message) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | ConnectClass</title></head><body><main><h1>${title}</h1><p>${message}</p><a href="/login">Voltar ao login</a></main></body></html>`);
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; script-src 'self'; style-src 'self'"
  );
}

function hasAllowedOrigin(request, isProduction) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  if (!host) return false;
  const protocol = request.socket.encrypted || isProduction ? "https" : "http";
  return origin === `${protocol}://${host}`;
}

class RequestBodyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function readRequestBody(request, timeoutMs) {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    request.resume();
    return Promise.reject(new RequestBodyError("Envie o conteúdo como application/json.", 415));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const timer = setTimeout(() => finish(new RequestBodyError("O envio da requisição demorou demais.", 408)), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chunks.length = 0;
      if (error) { request.resume(); reject(error); }
      else resolve(value);
    }
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        chunks.length = 0;
        finish(new RequestBodyError("A requisição excede o tamanho permitido.", 413));
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", () => finish(new RequestBodyError("Não foi possível ler a requisição.")));
    request.on("aborted", () => finish(new RequestBodyError("A requisição foi interrompida.")));
    request.on("end", () => {
      if (settled) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error();
        }
        finish(null, body);
      } catch {
        finish(new RequestBodyError("Envie um JSON válido."));
      }
    });
  });
}

function allowAuthenticationAttempt(context) {
  if (context.authLimiter.consume(context.request.socket.remoteAddress ?? "unknown")) return true;
  return rejectAuthentication(context);
}

function reservePasswordWork(context) {
  if (context.authLimiter.reserve()) return true;
  return rejectAuthentication(context);
}

function rejectAuthentication({ request, response, authLimiter }) {
  request.resume();
  response.setHeader("Retry-After", Math.ceil(authLimiter.windowMs / 1000));
  sendJson(response, 429, { message: "Muitas tentativas. Aguarde um minuto e tente novamente." });
  return false;
}

function createAuthLimiter(limit, windowMs) {
  const attempts = new Map();
  let inFlight = 0;
  return {
    windowMs,
    consume(address) {
      const now = Date.now();
      for (const [key, entry] of attempts) {
        if (entry.expiresAt <= now) attempts.delete(key);
      }
      const entry = attempts.get(address) ?? { count: 0, expiresAt: now + windowMs };
      if (entry.count >= limit) return false;
      if (!attempts.has(address) && attempts.size >= 1_000) return false;
      entry.count += 1;
      attempts.set(address, entry);
      return true;
    },
    reserve() {
      if (inFlight >= 4) return false;
      inFlight += 1;
      return true;
    },
    release() { inFlight -= 1; },
  };
}
