import { createConnectClassApp } from "./server/app.js";
import { loadEnvFile } from "node:process";
import { safeDatabaseError } from "./server/database/connection.js";

try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw new Error("Arquivo de ambiente inválido."); }

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT deve ser uma porta válida.");
try {
  const app = await createConnectClassApp();
  app.server.on("error", async (error) => {
    console.error("[ConnectClass] Falha HTTP:", safeDatabaseError(error));
    await app.close(); process.exitCode = 1;
  });
  app.server.listen(port, host, () => {
    console.info(`[ConnectClass] Servidor disponível em http://${host}:${app.server.address().port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
    const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
    await app.close(); clearTimeout(deadline);
  });
} catch (error) {
  console.error("[ConnectClass] Inicialização recusada. Confira configuração/schema:", safeDatabaseError(error));
  process.exitCode = 1;
}
