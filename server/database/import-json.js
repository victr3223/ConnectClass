import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CATEGORIES, MESSAGE_STATUSES } from "../messages.js";

const validId = (v) => Number.isSafeInteger(v) && v > 0;
const text = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).getUTCFullYear() >= 1000;
const invalid = () => { throw new Error("Importação recusada: documento inválido, duplicado ou com referência órfã. Originais preservados."); };

export function validateImport(users, messages) {
  if (!Array.isArray(users) || !Array.isArray(messages)) invalid();
  const byId = new Map(), emails = new Set(), ras = new Set(), ids = new Set(), replies = new Set();
  for (const u of users) {
    if (!validId(u?.id) || byId.has(u.id) || !text(u.nome, 120) || !text(u.email, 254) ||
        !["aluno", "gestor"].includes(u.tipo) || !/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/.test(u.senhaHash ?? "") ||
        (u.tipo === "aluno" && (!text(u.ra, 40) || !text(u.turma, 80))) ||
        (u.ra != null && !text(u.ra, 40)) || (u.turma != null && !text(u.turma, 80))) invalid();
    const email = u.email.trim().toLocaleLowerCase("pt-BR"), ra = u.ra?.trim().toLocaleLowerCase("pt-BR");
    if (emails.has(email) || (ra && ras.has(ra))) invalid();
    if (u.created_at != null && !date(u.created_at)) invalid();
    if (u.updated_at != null && !date(u.updated_at)) invalid();
    emails.add(email); if (ra) ras.add(ra); byId.set(u.id, u);
  }
  for (const m of messages) {
    if (!validId(m?.id) || ids.has(m.id) || byId.get(m.alunoId)?.tipo !== "aluno" ||
        !Object.values(CATEGORIES).includes(m.tipo) || !MESSAGE_STATUSES.includes(m.status) ||
        !text(m.mensagem, 1000) || !date(m.dataHora) || (m.respostas !== undefined && !Array.isArray(m.respostas))) invalid();
    for (const [field,max] of [["nomeAluno",120],["ra",40],["turma",80]]) if (m[field] != null && !text(m[field],max)) invalid();
    ids.add(m.id);
    for (const r of m.respostas ?? []) {
      if (!validId(r?.id) || replies.has(r.id) || r.mensagemId !== m.id || byId.get(r.gestorId)?.tipo !== "gestor" ||
          !text(r.mensagem,1000) || !date(r.dataHora) || (r.nomeGestor != null && !text(r.nomeGestor,120))) invalid();
      replies.add(r.id);
    }
  }
  const rootMax = Math.max(0, ...ids), replyMax = Math.max(0, ...replies);
  if (!Number.isSafeInteger(rootMax + replyMax + 1)) invalid();
  return { users: users.length, conversations: messages.length, messages: messages.length + replies.size, replies: replies.size };
}

export async function importJson(pool, directory) {
  // Explicit import only. Runtime never imports this module or reads these files.
  const [usersBytes, messagesBytes] = await Promise.all([readFile(join(directory, "usuarios.json")), readFile(join(directory, "mensagens.json"))]);
  let users, messages;
  try { users = JSON.parse(usersBytes).usuarios; messages = JSON.parse(messagesBytes).mensagens; } catch { invalid(); }
  const counts = validateImport(users, messages);
  const fingerprint = createHash("sha256").update(usersBytes).update("\0").update(messagesBytes).digest("hex");
  const connection = await pool.getConnection();
  let locked = false, started = false;
  try {
    const [[lock]] = await connection.execute("SELECT GET_LOCK(CONCAT('connectclass:import:', DATABASE()), 10) AS acquired");
    if (lock.acquired !== 1) throw new Error("Importação já em andamento.");
    locked = true;
    await connection.beginTransaction(); started = true;
    const [done] = await connection.execute("SELECT fingerprint FROM import_batches WHERE fingerprint = ?", [fingerprint]);
    if (done.length) { await connection.commit(); started = false; return { alreadyImported: true, ...counts }; }
    const [[existing]] = await connection.execute("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM conversations) + (SELECT COUNT(*) FROM messages) AS total");
    if (Number(existing.total) !== 0) throw new Error("Destino não vazio. Não sobrescrever ou mesclar automaticamente; restaure em destino limpo e revisado.");
    const now = new Date();
    for (const u of users) await connection.execute(
      "INSERT INTO users (id,nome,ra,email,senha_hash,tipo,turma,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [u.id,u.nome,u.ra??null,u.email,u.senhaHash,u.tipo,u.turma??null,u.created_at?new Date(u.created_at):now,u.updated_at?new Date(u.updated_at):now]);
    const rootMax = Math.max(0, ...messages.map((m) => m.id));
    for (const m of messages) {
      const created = new Date(m.dataHora), last = new Date(Math.max(created.getTime(), ...(m.respostas??[]).map((r)=>Date.parse(r.dataHora))));
      await connection.execute(
        "INSERT INTO conversations (id,usuario_id,categoria,status,nome_aluno_snapshot,ra_snapshot,turma_snapshot,created_at,updated_at,last_activity_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [m.id,m.alunoId,m.tipo,m.status,m.nomeAluno??null,m.ra??null,m.turma??null,created,last,last]);
      await connection.execute("INSERT INTO messages (id,conversation_id,sender_id,sender_type,content,created_at) VALUES (?,?,?,'aluno',?,?)", [m.id,m.id,m.alunoId,m.mensagem,created]);
      for (const r of m.respostas??[]) await connection.execute(
        "INSERT INTO messages (id,conversation_id,sender_id,sender_type,sender_name_snapshot,content,created_at,legacy_reply_id) VALUES (?,?,?,'gestor',?,?,?,?)",
        [rootMax+r.id,m.id,r.gestorId,r.nomeGestor??null,r.mensagem,new Date(r.dataHora),r.id]);
    }
    const [[actual]] = await connection.execute("SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM conversations) AS conversations, COUNT(*) AS messages, COALESCE(SUM(sender_type = 'gestor'),0) AS replies FROM messages");
    if (Object.keys(counts).some((k) => Number(actual[k]) !== counts[k])) throw new Error("Reconciliação falhou; importação será revertida.");
    // Detect concurrent source writes; do not claim a consistent backup of a live JSON server.
    const [usersAfter, messagesAfter] = await Promise.all([readFile(join(directory,"usuarios.json")),readFile(join(directory,"mensagens.json"))]);
    if (!usersBytes.equals(usersAfter) || !messagesBytes.equals(messagesAfter)) throw new Error("Origem alterada durante importação; pare o servidor antigo e tente novamente.");
    await connection.execute("INSERT INTO import_batches (fingerprint,users_count,conversations_count,replies_count,imported_at) VALUES (?,?,?,?,UTC_TIMESTAMP(3))", [fingerprint,counts.users,counts.conversations,counts.replies]);
    await connection.commit(); started = false;
    return { alreadyImported:false, ...counts };
  } catch (error) { if (started) await connection.rollback().catch(()=>{}); throw error; }
  finally {
    if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT('connectclass:import:', DATABASE()))").catch(()=>{});
    connection.release();
  }
}
