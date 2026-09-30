import { hashPassword, validatePassword, verifyPassword } from "./passwords.js";
import { createUserRepository, DISABLED_ACCOUNT_HASH } from "./users.js";

const normalize = value => typeof value === "string" ? value.trim().toLocaleLowerCase("pt-BR") : "";
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function httpRequest(baseUrl, path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method, redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { ...(body ? {"Content-Type":"application/json"} : {}), ...(cookie ? {Cookie:cookie} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return {status:response.status, body:data, cookie:response.headers.get("set-cookie")?.split(";")[0]};
}

// Only users INSERT and one exactly scoped UPDATE; no DDL or historical deletion.
// A failed HTTP check leaves the old manager active. A retry never resets passwords.
export async function replaceManager({ pool, newEmail, newPassword, oldEmail, baseUrl,
  oldPassword, request = httpRequest, onStage = () => {} }) {
  newEmail = normalize(newEmail); oldEmail = normalize(oldEmail);
  const url = new URL(baseUrl);
  if (!validEmail(newEmail) || !validEmail(oldEmail) || newEmail === oldEmail || validatePassword(newPassword)) {
    throw new Error("Configuração da troca inválida; confira os e-mails e a senha localmente.");
  }
  if (!["http:","https:"].includes(url.protocol) || !["127.0.0.1","localhost","[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("A validação da troca exige a URL local do app.");
  }
  const connection = await pool.getConnection();
  const users = createUserRepository(pool);
  let locked = false, old, target, created = false, session, changedOld = false;
  const ask = (path, options) => request(baseUrl, path, options);
  const login = (email, password) => ask("/api/auth/login", {method:"POST",body:{identidade:email,senha:password}});
  try {
    const [[lock]] = await connection.execute("SELECT GET_LOCK(CONCAT('connectclass:manager:', DATABASE()), 10) AS acquired");
    if (lock.acquired !== 1) throw new Error("Troca de gestor ocupada; nenhuma alteração aplicada.");
    locked = true;
    const [oldRows] = await connection.execute("SELECT id, tipo, senha_hash FROM users WHERE email = ?", [oldEmail]);
    old = oldRows[0];
    if (!old || old.tipo !== "gestor") throw new Error("A conta antiga deve existir e ser gestor.");
    const [newRows] = await connection.execute("SELECT id, tipo, senha_hash FROM users WHERE email = ?", [newEmail]);
    target = newRows[0];
    if (target && (target.id === old.id || target.tipo !== "gestor" || !await verifyPassword(newPassword, target.senha_hash))) {
      throw new Error("A conta de destino já existe e não corresponde ao novo gestor informado.");
    }
    if (!target) {
      if (old.senha_hash === DISABLED_ACCOUNT_HASH) throw new Error("Gestor antigo já desativado; destino inexistente. Revisar antes de prosseguir.");
      const hash = await hashPassword(newPassword);
      const [insert] = await connection.execute(
        "INSERT INTO users (nome, email, senha_hash, tipo, created_at, updated_at) VALUES (?, ?, ?, 'gestor', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
        ["Administrador ConnectClass", newEmail, hash]);
      target = {id:insert.insertId, tipo:"gestor", senha_hash:hash}; created = true;
    }
    const [confirmed] = await connection.execute("SELECT id, tipo FROM users WHERE id = ?", [target.id]);
    if (confirmed[0]?.tipo !== "gestor") throw new Error("Tipo do novo gestor não confirmado.");
    onStage("new_manager_confirmed");
    session = await login(newEmail, newPassword);
    if (session.status !== 200 || !session.cookie || session.body?.user?.id !== target.id || session.body.user.tipo !== "gestor") {
      throw new Error("Login do novo gestor não confirmado; conta antiga preservada.");
    }
    onStage("new_login_confirmed");
    const dashboard = await ask("/api/gestor", {cookie:session.cookie});
    const page = await ask("/gestor", {cookie:session.cookie});
    if (dashboard.status !== 200 || dashboard.body?.user?.id !== target.id || !dashboard.body.dashboard || page.status !== 200) {
      throw new Error("Dashboard do novo gestor não confirmado; conta antiga preservada.");
    }
    onStage("dashboard_confirmed");
    let previousSession;
    if (oldPassword && await verifyPassword(oldPassword, old.senha_hash)) {
      previousSession = await login(oldEmail, oldPassword);
      if (previousSession.status !== 200) throw new Error("Sessão anterior não confirmada; conta antiga preservada.");
    }
    if (old.senha_hash !== DISABLED_ACCOUNT_HASH) {
      await connection.beginTransaction();
      try {
        const [currentNew] = await connection.execute("SELECT tipo, senha_hash FROM users WHERE id = ? FOR UPDATE", [target.id]);
        if (currentNew[0]?.tipo !== "gestor" || currentNew[0].senha_hash !== target.senha_hash) throw new Error("Destino alterado durante a validação.");
        const [updated] = await connection.execute(
          "UPDATE users SET senha_hash = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND tipo = 'gestor' AND senha_hash = ?",
          [DISABLED_ACCOUNT_HASH, old.id, old.senha_hash]);
        if (updated.affectedRows !== 1) throw new Error("Conta antiga alterada durante a validação.");
        await connection.commit();
        changedOld = true;
      } catch (error) { await connection.rollback(); throw error; }
    }
    onStage("old_manager_disabled");
    // Marker cannot pass verifyPassword; findById also rejects all existing sessions.
    const [disabled] = await connection.execute("SELECT senha_hash FROM users WHERE id = ?", [old.id]);
    if (disabled[0]?.senha_hash !== DISABLED_ACCOUNT_HASH || await users.findById(old.id)) throw new Error("Desativação não confirmada.");
    const oldLogin = await login(oldEmail, oldPassword || newPassword);
    if (oldLogin.status !== 401) throw new Error("Bloqueio de login antigo não confirmado.");
    if (previousSession?.cookie && (await ask("/api/gestor", {cookie:previousSession.cookie})).status !== 401) {
      throw new Error("Sessão antiga ainda tem acesso; verificar a versão do app.");
    }
    if ((await ask("/api/gestor", {cookie:session.cookie})).status !== 200) throw new Error("Revalidação do novo Dashboard falhou.");
    onStage("replacement_verified");
    return {created, oldDisabled:true, newLogin:true, dashboard:true};
  } catch (error) {
    if (changedOld) {
      // Forward recovery of this exact change only; preserve both accounts/data.
      await connection.execute("UPDATE users SET senha_hash = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND senha_hash = ?",
        [old.senha_hash, old.id, DISABLED_ACCOUNT_HASH]);
    }
    throw error;
  } finally {
    if (session?.cookie) await ask("/api/auth/logout", {method:"POST",cookie:session.cookie,body:{}}).catch(() => {});
    if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT('connectclass:manager:', DATABASE()))").catch(() => {});
    connection.release();
  }
}
