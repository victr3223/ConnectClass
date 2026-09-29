import mysql from "mysql2/promise";

export function databaseConfig(env = process.env, { admin = false } = {}) {
  const port = Number(env.DB_PORT ?? 3306);
  const database = env.DB_NAME;
  if (!env.DB_HOST || !env.DB_USER || !env.DB_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535 ||
      (!admin && (!database || !/^[a-zA-Z0-9_]{1,64}$/.test(database)))) {
    throw new Error("Configuração MySQL incompleta ou inválida. Confira as variáveis DB_* localmente.");
  }
  if (!admin && env.DB_USER.toLowerCase() === "root") throw new Error("Use um usuário próprio da aplicação, não root.");
  return { host: env.DB_HOST, port, user: env.DB_USER, password: env.DB_PASSWORD,
    ...(database ? { database } : {}), charset: "utf8mb4", timezone: "Z",
    supportBigNumbers: true, bigNumberStrings: false, multipleStatements: false,
    connectTimeout: 5000, enableKeepAlive: true };
}

export function createDatabasePool(config = databaseConfig()) {
  const pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 10,
    maxIdle: 5, idleTimeout: 60000, queueLimit: 100 });
  pool.on("connection", (connection) => {
    connection.query("SET SESSION time_zone = '+00:00', group_concat_max_len = 16777216");
  });
  return pool;
}

export async function transaction(pool, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

export function safeDatabaseError(error) {
  // Never emit driver message, SQL, parameters, connection config or stack.
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : "INTERNAL_ERROR";
  return { code };
}
