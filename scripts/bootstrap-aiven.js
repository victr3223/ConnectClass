import mysql from "mysql2/promise";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes, X509Certificate } from "node:crypto";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseConfig, createDatabasePool, safeDatabaseError } from "../server/database/connection.js";
import { initializeSchema, verifySchema } from "../server/database/migrations.js";
import { initializeServerlessSchema, verifyServerlessSchema } from "../server/database/serverless-auth.js";
import { createUserRepository } from "../server/users.js";

const plans = [{ database: "connectclass_preview", file: ".env.vercel.preview", preview: true },
  { database: "connectclass", file: ".env.vercel.production" }];
const tables = new Set(["users", "conversations", "messages", "import_batches", "schema_migrations", "web_sessions", "auth_attempts"]);
const stages = new Set(["input", "config", "certificate", "admin-connect", "inspect", "lock", "schema", "private-record", "account", "app-connect", "privileges", "seed", "verify"]);
const hints = {
  ER_ACCESS_DENIED_ERROR: "Autenticação recusada; confira privadamente usuário/senha. Nenhuma senha foi redefinida.",
  ER_DBACCESS_DENIED_ERROR: "A conta não tem acesso ao banco solicitado.",
  ER_SPECIFIC_ACCESS_DENIED_ERROR: "Permissão administrativa insuficiente para esta etapa.",
  ER_PARSE_ERROR: "O servidor recusou a sintaxe SQL nesta etapa.",
  HANDSHAKE_SSL_ERROR: "Negociação TLS recusada; confira cadeia, validade e identidade do certificado. A validação permanece obrigatória.",
  ENOTFOUND: "Falha DNS: confira o endpoint oficial.",
  ETIMEDOUT: "Conexão excedeu o tempo limite; confira rede/firewall e porta.",
  ECONNREFUSED: "O endpoint recusou a conexão TCP.",
  ERR_TLS_CERT_ALTNAME_INVALID: "O certificado não corresponde ao hostname; não desabilite a validação.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "A CA não valida a cadeia do servidor; baixe a CA do serviço correto.",
  SELF_SIGNED_CERT_IN_CHAIN: "Confira a CA do serviço; a cadeia não foi validada.",
};
function failure(code, message) { return Object.assign(new Error(message), { code, setupMessage: message }); }
export function safeAivenFailure(error) {
  return { stage: stages.has(error?.stage) ? error.stage : "input", ...safeDatabaseError(error),
    ...(Number.isInteger(error?.errno) ? { errno: error.errno } : {}),
    ...(/^[0-9A-Z]{5}$/.test(error?.sqlState ?? "") ? { sqlState: error.sqlState } : {}),
    message: hints[error?.code] ?? error?.setupMessage ?? "Falha não classificada; preserve recursos e consulte a etapa/código. SQL e parâmetros foram omitidos." };
}
function validatePrivate(env, config, plan) {
  if (config.DB_HOST !== env.DB_HOST || String(config.DB_PORT) !== String(env.DB_PORT ?? 3306) ||
      config.DB_NAME !== plan.database || !/^cc_[a-f0-9]{12}$/.test(config.DB_USER ?? "") ||
      !config.DB_PASSWORD || config.DB_SSL !== "true" || !config.DB_SSL_CA) {
    throw failure("PRIVATE_CONFIG_MISMATCH", "Configuração privada inválida ou de outro destino; não será sobrescrita.");
  }
  databaseConfig(config);
}
async function loadPrivate(env, plan, directory) {
  try {
    const config = parseEnv(await readFile(resolve(directory, plan.file), "utf8"));
    validatePrivate(env, config, plan);
    return config;
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function validateCa(pem) {
  if (typeof pem !== "string") throw failure("INVALID_CA_TYPE", "CA deve chegar como string PEM; confira a serialização do lançador PowerShell.");
  let cert;
  try { cert = new X509Certificate(pem.replace(/\\n/g, "\n")); }
  catch { throw failure("INVALID_CA", "CA PEM inválida; use o conteúdo do certificado, não um caminho."); }
  if (!cert.ca || Date.now() < Date.parse(cert.validFrom) || Date.now() >= Date.parse(cert.validTo)) {
    throw failure("INVALID_CA", "CA fora da validade ou sem capacidade de autoridade certificadora.");
  }
  return cert.fingerprint256;
}
async function tlsState(connection) {
  const stream = connection.connection.stream;
  const [rows] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (!stream.encrypted || stream.authorized !== true || !rows[0]?.Value) throw failure("TLS_NOT_VERIFIED", "TLS e identidade do servidor devem estar validados.");
  return { authorized: true, protocol: stream.getProtocol(), cipher: rows[0].Value };
}
async function inspectResources(connection, saved) {
  const [databases] = await connection.execute("SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?, ?)", plans.map(p => p.database));
  const resources = [];
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    const [rows] = await connection.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [plan.database]);
    if (rows.some(row => !tables.has(row.name))) throw failure("UNKNOWN_SCHEMA", "Destino contém tabelas não reconhecidas; inspeção manual necessária, sem alterações.");
    if (rows.some(row => row.name === "schema_migrations")) {
      const [versions] = await connection.execute(`SELECT version FROM \`${plan.database}\`.schema_migrations ORDER BY version`);
      if (versions.some(row => row.version !== 1)) throw failure("UNKNOWN_SCHEMA_VERSION", "Schema incompatível; não aplicar downgrade.");
    }
    resources.push({ database: plan.database, exists: databases.some(row => row.name === plan.database),
      tables: rows.map(row => row.name), privateConfig: Boolean(saved[index]) });
  }
  return resources;
}
export function assertDmlGrants(rows, database, { allowMissing = false } = {}) {
  let dml = false;
  for (const row of rows) {
    const grant = String(Object.values(row)[0]).replace(/[`\\]/g, "");
    if (/WITH GRANT OPTION/i.test(grant)) throw failure("EXCESSIVE_APP_PRIVILEGES", "Conta existente possui GRANT OPTION; nada será revogado ou alterado automaticamente.");
    if (/^GRANT USAGE ON \*\.\* TO /i.test(grant)) continue;
    const match = /^GRANT (.+) ON ([^ ]+) TO /i.exec(grant);
    const privileges = match?.[1].split(", ");
    // SHOW GRANTS quotes identifiers with double quotes when ANSI_QUOTES is active.
    const sameDatabase = match && [database + ".*", `"${database}".*`].includes(match[2]);
    if (!match || !sameDatabase || privileges.some(value => !["SELECT", "INSERT", "UPDATE", "DELETE"].includes(value)) || /WITH GRANT OPTION/i.test(grant)) {
      throw failure("EXCESSIVE_APP_PRIVILEGES", "Conta existente possui privilégios divergentes; nada será revogado ou redefinido automaticamente.");
    }
    dml = privileges.length === 4;
  }
  if (!dml && !allowMissing) throw failure("MISSING_APP_PRIVILEGES", "Conta não possui os quatro privilégios DML esperados.");
  return dml;
}

// Recovery is additive. Existing credentials are reused, never reset or overwritten.
export async function bootstrapAiven(env, { inspectOnly = false, directory = process.cwd(), connect = mysql.createConnection, poolFactory = createDatabasePool } = {}) {
  let stage = "config", connection, locked = false;
  try {
    if (!env.DB_HOST?.endsWith(".aivencloud.com") || env.DB_SSL !== "true" || !env.DB_SSL_CA) throw failure("AIVEN_TLS_REQUIRED", "Aiven TLS/CA obrigatório.");
    const saved = await Promise.all(plans.map(plan => loadPrivate(env, plan, directory)));
    stage = "certificate";
    const caFingerprint = validateCa(env.DB_SSL_CA);
    for (const config of saved.filter(Boolean)) {
      if (validateCa(config.DB_SSL_CA) !== caFingerprint) throw failure("PRIVATE_CA_MISMATCH", "A CA privada diverge da CA informada; preservar configurações e inspecionar.");
    }
    stage = "config";
    let config;
    try { config = databaseConfig(env, { admin: true }); }
    catch { throw failure("INVALID_CONFIG", "Configuração MySQL incompleta ou inválida; confira os campos localmente."); }
    stage = "admin-connect";
    connection = await connect(config);
    const tls = await tlsState(connection);
    stage = "inspect";
    const resources = await inspectResources(connection, saved);
    const report = { mode: inspectOnly ? "inspect" : "configure", adminAuthentication: true, tls, caFingerprint, resources, applications: [] };
    if (inspectOnly) return report;
    stage = "lock";
    const [[lock]] = await connection.execute("SELECT GET_LOCK('connectclass:aiven-bootstrap', 30) AS acquired");
    if (lock.acquired !== 1) throw failure("SETUP_BUSY", "Outra configuração está em andamento; nenhum recurso alterado.");
    locked = true;
    for (let index = 0; index < plans.length; index++) {
      const plan = plans[index];
      stage = "schema";
      await initializeSchema(connection, plan.database, { createDatabase: true });
      await initializeServerlessSchema(connection);
      await verifySchema(connection);
      let appEnv = saved[index];
      if (!appEnv) {
        const [[count]] = await connection.execute("SELECT COUNT(*) AS count FROM users");
        appEnv = { DB_HOST: env.DB_HOST, DB_PORT: String(env.DB_PORT ?? 3306), DB_USER: `cc_${randomBytes(6).toString("hex")}`,
          DB_PASSWORD: randomBytes(32).toString("base64url"), DB_NAME: plan.database, DB_SSL: "true",
          DB_SSL_CA: env.DB_SSL_CA.replace(/\r\n/g, "\n"), DB_POOL_LIMIT: "3", NODE_ENV: "production", NODEJS_HELPERS: "0",
          ...(plan.preview && count.count === 0 ? { CONNECTCLASS_TEST_MANAGER_PASSWORD: randomBytes(32).toString("base64url") } : {}) };
        // Persist before account DDL, so interruption never loses a generated password.
        stage = "private-record";
        await writeFile(resolve(directory, plan.file), Object.entries(appEnv).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
      }
      stage = "account";
      let exists = true, complete = false;
      try {
        const [grants] = await connection.query("SHOW GRANTS FOR ?@'%'", [appEnv.DB_USER]);
        complete = assertDmlGrants(grants, plan.database, { allowMissing: true });
        // Verify the saved credential before adding grants to an existing account.
        stage = "app-connect";
        const account = await connect({ ...databaseConfig(appEnv), database: undefined });
        try { await tlsState(account); } finally { await account.end(); }
      }
      catch (error) { if (error.code === "ER_NONEXISTING_GRANT") exists = false; else throw error; }
      stage = "account";
      if (!exists) {
        await connection.query("CREATE USER ?@'%' IDENTIFIED BY ?", [appEnv.DB_USER, appEnv.DB_PASSWORD]);
      }
      if (!complete) {
        await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${plan.database}\`.* TO ?@'%'`, [appEnv.DB_USER]);
      }
      const pool = poolFactory(databaseConfig(appEnv), { connectionLimit: 2 });
      try {
        stage = "app-connect";
        const appConnection = await pool.getConnection();
        try {
          await tlsState(appConnection);
          const [[identity]] = await appConnection.execute("SELECT DATABASE() AS db");
          if (identity.db !== plan.database) throw failure("WRONG_DATABASE", "Conta conectada em banco divergente.");
          stage = "privileges";
          const [grants] = await appConnection.query("SHOW GRANTS");
          assertDmlGrants(grants, plan.database);
        } finally { appConnection.release(); }
        stage = "seed";
        if (plan.preview && appEnv.CONNECTCLASS_TEST_MANAGER_PASSWORD) await createUserRepository(pool).ensureInitialManager(appEnv.CONNECTCLASS_TEST_MANAGER_PASSWORD);
        stage = "verify";
        await verifySchema(pool);
        await verifyServerlessSchema(pool);
        report.applications.push({ database: plan.database, authenticated: true, tlsVerified: true, leastPrivilege: true, schema: true, reusedAccount: exists });
      } finally { await pool.end(); }
    }
    return report;
  } catch (error) { error.stage = stage; throw error; }
  finally {
    if (locked) await connection.execute("SELECT RELEASE_LOCK('connectclass:aiven-bootstrap')").catch(() => {});
    await connection?.end().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let report;
  try {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 32768) throw failure("INPUT_TOO_LARGE", "Entrada excede o limite permitido.");
    }
    report = { passed: true, ...await bootstrapAiven(JSON.parse(input), { inspectOnly: process.argv.includes("--inspect") }) };
    console.info(JSON.stringify(report));
  } catch (error) {
    report = { passed: false, error: safeAivenFailure(error) };
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  }
  try {
    await mkdir("backups/aiven-recovery", { recursive: true });
    await writeFile("backups/aiven-recovery/latest.json", JSON.stringify({ date: new Date().toISOString(), ...report }, null, 2), { mode: 0o600 });
  } catch { console.error("Relatório privado indisponível; o resultado sanitizado acima permanece válido."); process.exitCode = 1; }
}
