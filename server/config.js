export function httpConfig(env = process.env) {
  const port = Number(env.PORT ?? 8081);
  const host = env.HOST || (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT deve ser uma porta válida.");
  return { port, host };
}
