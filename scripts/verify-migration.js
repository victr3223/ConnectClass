// Read-only reconciliation. Never print database records, credentials or hashes.
import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { createDatabasePool, safeDatabaseError } from "../server/database/connection.js";
import { validateImport } from "../server/database/import-json.js";

try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw new Error("Configuração inválida."); }
let pool;
function requireMatch(value) { if (!value) throw new Error("Reconciliação divergiu; preserve origem e destino para revisão privada."); }
try {
  if (!process.argv[2] || process.env.DB_NAME !== "connectclass_final") throw new Error("Origem ou banco de reconciliação inválido.");
  const directory = resolve(process.argv[2]);
  const bytes = await Promise.all(["usuarios.json", "mensagens.json"].map((name) => readFile(join(directory, name))));
  const users = JSON.parse(bytes[0]).usuarios, messages = JSON.parse(bytes[1]).mensagens;
  const counts = validateImport(users, messages);
  pool = createDatabasePool();
  const [storedUsers] = await pool.execute("SELECT id,nome,ra,email,senha_hash,tipo,turma FROM users ORDER BY id");
  requireMatch(storedUsers.length === users.length);
  for (const u of users) {
    const stored = storedUsers.find((row) => row.id === u.id);
    requireMatch(stored && stored.nome === u.nome && stored.ra === (u.ra ?? null) && stored.email === u.email &&
      stored.senha_hash === u.senhaHash && stored.tipo === u.tipo && stored.turma === (u.turma ?? null));
  }
  const [conversations] = await pool.execute("SELECT id,usuario_id,categoria,status,created_at FROM conversations ORDER BY id");
  const [entries] = await pool.execute("SELECT conversation_id,sender_id,sender_type,content,created_at,legacy_reply_id FROM messages ORDER BY id");
  requireMatch(conversations.length === counts.conversations && entries.length === counts.messages);
  for (const m of messages) {
    const c = conversations.find((row) => row.id === m.id);
    const root = entries.find((row) => row.conversation_id === m.id && row.sender_type === "aluno");
    requireMatch(c && root && c.usuario_id === m.alunoId && c.categoria === m.tipo && c.status === m.status &&
      c.created_at.getTime() === Date.parse(m.dataHora) && root.content === m.mensagem && root.sender_id === m.alunoId);
    for (const reply of m.respostas ?? []) {
      const r = entries.find((row) => row.conversation_id === m.id && row.legacy_reply_id === reply.id && row.sender_type === "gestor");
      requireMatch(r && r.sender_id === reply.gestorId && r.content === reply.mensagem && r.created_at.getTime() === Date.parse(reply.dataHora));
    }
  }
  const fingerprint = createHash("sha256").update(bytes[0]).update("\0").update(bytes[1]).digest("hex");
  const [batches] = await pool.execute("SELECT users_count,conversations_count,replies_count FROM import_batches WHERE fingerprint = ?", [fingerprint]);
  requireMatch(batches.length === 1 && Number(batches[0].users_count) === counts.users &&
    Number(batches[0].conversations_count) === counts.conversations && Number(batches[0].replies_count) === counts.replies);
  console.info("PASSOU: origem e MySQL reconciliados; IDs, identidades, hashes, conteúdo, status e datas preservados. Nenhum valor privado exibido.");
} catch (error) {
  console.error("Reconciliação não confirmada:", safeDatabaseError(error)); process.exitCode = 1;
} finally { await pool?.end(); }
