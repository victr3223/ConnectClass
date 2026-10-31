import { isIP } from "node:net";
import { attachDatabasePool } from "@vercel/functions";
import { createConnectClassApp } from "./app.js";
import { databaseConfig, safeDatabaseError } from "./database/connection.js";

const POOL_IDLE_TIMEOUT_MS = 5000;

// Trust this header only in the Vercel adapter: the platform overwrites it.
export function vercelClientAddress(request) {
  const address = request.headers["x-forwarded-for"]?.split(",")[0].trim();
  return isIP(address ?? "") ? address : "unknown";
}

export function createVercelHandler({ env = process.env, createApp = createConnectClassApp, logger = console } = {}) {
  let application;
  return async (request, response) => {
    try {
      if (!application) {
        application = (async () => {
          if (env.DB_SSL !== "true") throw new Error("MySQL externo exige TLS.");
          const poolLimit = Number(env.DB_POOL_LIMIT ?? 3);
          return createApp({ database: databaseConfig(env), poolLimit, poolIdleTimeoutMs: POOL_IDLE_TIMEOUT_MS, durableAuth: true, isProduction: true,
            clientAddress: vercelClientAddress,
            // PromisePool hides config; allow mysql2's 1s cleanup tick before suspension.
            onPoolCreated: pool => attachDatabasePool({ config: { idleTimeout: POOL_IDLE_TIMEOUT_MS + 1000 }, on: pool.on.bind(pool) }), logger });
        })();
        application.catch(() => { application = undefined; });
      }
      const app = await application;
      await app.handler(request, response);
    } catch (error) {
      logger.error("[ConnectClass] Serviço indisponível:", safeDatabaseError(error));
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "10" });
      response.end(JSON.stringify({ message: "Serviço temporariamente indisponível." }));
    }
  };
}
