import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureJsonFile } from "./json-store.js";
import { createUserRepository, ConflictError, publicUser, ValidationError } from "./users.js";
import { createSessionStore, readCookies, serializeSessionCookie, SESSION_COOKIE } from "./sessions.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = join(moduleDirectory, "..");
const defaultDataDirectory = join(defaultPublicDirectory, "data");
const REGULAR_SESSION_TTL = 8 * 60 * 60 * 1_000;
const REMEMBERED_SESSION_TTL = 7 * 24 * 60 * 60 * 1_000;
const MAX_BODY_SIZE = 16 * 1024;

const publicFiles = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/login": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/script.js": { file: "script.js", contentType: "application/javascript; charset=utf-8" },
  "/Captura%20de%20tela%20de%202026-06-07%2023-06-40.png": { file: "Captura de tela de 2026-06-07 23-06-40.png", contentType: "image/png" },
};

export async function createConnectClassApp(options = {}) {
  const publicDirectory = options.publicDirectory ?? defaultPublicDirectory;
  const dataDirectory = options.dataDirectory ?? defaultDataDirectory;
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  const logger = options.logger ?? console;
  const usersFile = join(dataDirectory, "usuarios.json");
  const messagesFile = join(dataDirectory, "mensagens.json");
  const users = createUserRepository(usersFile);
  const sessions = createSessionStore({
    regularTtlMs: options.regularSessionTtlMs ?? REGULAR_SESSION_TTL,
    rememberedTtlMs: options.rememberedSessionTtlMs ?? REMEMBERED_SESSION_TTL,
  });

  await users.initialize();
  await ensureJsonFile(messagesFile, { mensagens: [] });

  const generatedManagerPassword =
    options.managerPassword ?? process.env.CONNECTCLASS_GESTOR_PASSWORD ?? generateTemporaryPassword();
  const createdManager = await users.ensureInitialManager(generatedManagerPassword);
  if (createdManager) {
    logger.info("[ConnectClass] Gestor local inicial criado.");
    logger.info("[ConnectClass] E-mail: gestor@connectclass.local");
    logger.info(`[ConnectClass] Senha temporária: ${generatedManagerPassword}`);
    logger.info("[ConnectClass] Guarde esta senha localmente; ela não é salva em texto puro.");
  }

  const server = createServer(async (request, response) => {
    try {
      await handleRequest({ request, response, users, sessions, publicDirectory, isProduction });
    } catch (error) {
      console.error("[ConnectClass] Erro inesperado:", error);
      sendJson(response, 500, { message: "Não foi possível concluir a operação. Tente novamente." });
    }
  });

  return { server, usersFile, messagesFile };
}

async function handleRequest(context) {
  const { request, response } = context;
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  applySecurityHeaders(response);

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    return handleRegistration(context);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    return handleLogin(context);
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
    return protectedApi(context, "gestor");
  }

  if (request.method === "GET" && url.pathname === "/aluno") {
    return protectedPage(context, "aluno", "index.html");
  }

  if (request.method === "GET" && url.pathname === "/gestor") {
    return protectedPage(context, "gestor", "gestor.html");
  }

  if (request.method === "GET" && publicFiles[url.pathname]) {
    return sendFile(response, join(context.publicDirectory, publicFiles[url.pathname].file), publicFiles[url.pathname].contentType);
  }

  sendJson(response, 404, { message: "Rota não encontrada." });
}

async function handleRegistration(context) {
  const { request, response, users } = context;
  if (!hasAllowedOrigin(request)) {
    return sendJson(response, 403, { message: "Origem da requisição não permitida." });
  }

  try {
    const body = await readRequestBody(request);
    const user = await users.createStudent({
      nome: body.nome,
      ra: body.ra,
      turma: body.turma,
      email: body.email,
      senha: body.senha,
      confirmacaoSenha: body.confirmacaoSenha,
    });
    const session = context.sessions.create(user.id, false);
    response.setHeader("Set-Cookie", serializeSessionCookie(session.token, session.expiresAt, context.isProduction));
    return sendJson(response, 201, { user });
  } catch (error) {
    return sendKnownError(response, error);
  }
}

async function handleLogin(context) {
  const { request, response, users } = context;
  if (!hasAllowedOrigin(request)) {
    return sendJson(response, 403, { message: "Origem da requisição não permitida." });
  }

  try {
    const body = await readRequestBody(request);
    const user = await users.authenticate(body.identidade, body.senha);
    if (!user) {
      return sendJson(response, 401, { message: "RA/e-mail ou senha inválidos." });
    }

    const session = context.sessions.create(user.id, body.lembrarMe === true);
    response.setHeader("Set-Cookie", serializeSessionCookie(session.token, session.expiresAt, context.isProduction));
    return sendJson(response, 200, { user: publicUser(user) });
  } catch (error) {
    return sendKnownError(response, error);
  }
}

async function protectedApi(context, requiredType) {
  const user = await authenticatedUser(context);
  if (!user) return sendJson(context.response, 401, { message: "Autenticação necessária." });
  if (user.tipo !== requiredType) return sendJson(context.response, 403, { message: "Você não tem permissão para acessar este recurso." });
  return sendJson(context.response, 200, { user: publicUser(user) });
}

async function protectedPage(context, requiredType, file) {
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
    response.writeHead(200, { "Content-Type": contentType });
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
    return sendJson(response, 400, { message: error.message });
  }

  console.error("[ConnectClass] Erro de requisição:", error);
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

function hasAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  if (!host) return false;
  const protocol = request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return origin === `${protocol}://${host}`;
}

class RequestBodyError extends Error {}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new RequestBodyError("A requisição excede o tamanho permitido."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", () => reject(new RequestBodyError("Não foi possível ler a requisição.")));
    request.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error();
        }
        resolve(body);
      } catch {
        reject(new RequestBodyError("Envie um JSON válido."));
      }
    });
  });
}

function generateTemporaryPassword() {
  return `Cc!${randomBytes(12).toString("base64url")}`;
}
