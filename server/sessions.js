import { randomBytes } from "node:crypto";

export const SESSION_COOKIE = "connectclass_session";

export function createSessionStore({ regularTtlMs, rememberedTtlMs }) {
  const sessions = new Map();

  return {
    create(userId, rememberMe) {
      for (const [existingToken, session] of sessions) {
        if (session.expiresAt <= Date.now()) sessions.delete(existingToken);
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + (rememberMe ? rememberedTtlMs : regularTtlMs);
      sessions.set(token, { userId, expiresAt });
      return { token, expiresAt };
    },

    get(token) {
      const session = sessions.get(token);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
      }
      return session;
    },

    destroy(token) {
      if (token) sessions.delete(token);
    },
  };
}

export function readCookies(header = "") {
  return header.split(";").reduce((cookies, pair) => {
    const separator = pair.indexOf("=");
    if (separator < 1) return cookies;

    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Cookies inválidos são simplesmente ignorados.
    }
    return cookies;
  }, Object.create(null));
}

export function serializeSessionCookie(token, expiresAt, secure) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
