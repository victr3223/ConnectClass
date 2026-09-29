import { createConnectClassApp } from "./server/app.js";
import { loadEnvFile } from "node:process";
import { safeDatabaseError } from "./server/database/connection.js";
import { httpConfig } from "./server/config.js";

try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw new Error("Arquivo de ambiente inválido."); }

const { port, host } = httpConfig();
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
