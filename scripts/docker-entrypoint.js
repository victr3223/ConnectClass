import { migrateDockerSchema } from "../server/database/docker-migrations.js";
import { safeDatabaseError } from "../server/database/connection.js";
try {
  await migrateDockerSchema();
  // The HTTP process does not need migration credentials after initialization.
  delete process.env.DB_MIGRATION_PASSWORD;
  delete process.env.DB_MIGRATION_USER;
  console.info("[ConnectClass] Schema MySQL pronto; iniciando HTTP.");
  await import("../server.js");
} catch (error) {
  console.error("[ConnectClass] Inicialização Docker recusada:", safeDatabaseError(error));
  process.exitCode = 1;
}
