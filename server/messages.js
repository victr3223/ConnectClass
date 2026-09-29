import { transaction } from "./database/connection.js";


export const CATEGORIES = Object.freeze({
  perguntas: "Pergunta",
  reclamacoes: "Reclamação",
  sugestoes: "Sugestão",
});

export const MESSAGE_STATUSES = Object.freeze(["Pendente", "Respondida", "Resolvida", "Em análise"]);

export class MessageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MessageValidationError";
  }
}

export class MessageNotFoundError extends Error {
  constructor() {
    super("Mensagem não encontrada.");
    this.name = "MessageNotFoundError";
  }
}

const ROOT_SELECT = `SELECT c.id, c.usuario_id AS alunoId,
  COALESCE(c.nome_aluno_snapshot, u.nome) AS nomeAluno, COALESCE(c.ra_snapshot, u.ra) AS ra,
  COALESCE(c.turma_snapshot, u.turma) AS turma, c.categoria AS tipo, c.status,
  m.content AS mensagem, c.created_at AS dataHora`;
const ROOT_FROM = ` FROM conversations c JOIN users u ON u.id = c.usuario_id
  JOIN messages m ON m.conversation_id = c.id AND m.sender_type = 'aluno'`;

export function buildMessageFilter(filters) {
  const clauses = [], params = [];
  const add = (sql, value) => { clauses.push(sql); params.push(value); };
  if (filters.category) add("c.categoria = ?", filters.category);
  if (filters.status && filters.status !== "todos") add("c.status = ?", filters.status);
  if (filters.alunoId) add("c.usuario_id = ?", filters.alunoId);
  if (filters.turma) add("COALESCE(c.turma_snapshot, u.turma) COLLATE utf8mb4_0900_bin = ?", filters.turma);
  if (filters.dataInicial !== null && filters.dataInicial !== undefined) add("c.created_at >= ?", new Date(filters.dataInicial));
  if (filters.dataFinal !== null && filters.dataFinal !== undefined) add("c.created_at <= ?", new Date(filters.dataFinal));
  if (filters.search) add(`LOCATE(?, LOWER(CONCAT_WS(' ', c.categoria, m.content,
    COALESCE(c.nome_aluno_snapshot, u.nome), COALESCE(c.ra_snapshot, u.ra, ''),
    COALESCE(c.turma_snapshot, u.turma, ''),
    COALESCE((SELECT GROUP_CONCAT(r.content ORDER BY r.created_at, r.id SEPARATOR ' ')
      FROM messages r WHERE r.conversation_id = c.id AND r.sender_type = 'gestor'), '')
    )) COLLATE utf8mb4_0900_bin) > 0`, filters.search);
  return { sql: clauses.length ? clauses.join(" AND ") : "1 = 1", params };
}

async function withReplies(connection, rows) {
  if (!rows.length) return [];
  const [replies] = await connection.execute(`SELECT COALESCE(r.legacy_reply_id, r.id) AS id,
    r.conversation_id AS mensagemId, r.sender_id AS gestorId,
    COALESCE(r.sender_name_snapshot, u.nome) AS nomeGestor, r.content AS mensagem, r.created_at AS dataHora
    FROM messages r JOIN users u ON u.id = r.sender_id
    WHERE r.sender_type = 'gestor' AND r.conversation_id IN (${rows.map(() => "?").join(",")})
    ORDER BY r.created_at, r.id`, rows.map((row) => row.id));
  const grouped = new Map();
  for (const reply of replies) {
    reply.dataHora = reply.dataHora.toISOString();
    const list = grouped.get(reply.mensagemId) ?? [];
    list.push(reply); grouped.set(reply.mensagemId, list);
  }
  return rows.map((row) => ({ ...row, dataHora: row.dataHora.toISOString(), respostas: grouped.get(row.id) ?? [] }));
}

async function loadMessage(connection, id) {
  const [rows] = await connection.execute(ROOT_SELECT + ROOT_FROM + " WHERE c.id = ?", [id]);
  if (!rows.length) throw new MessageNotFoundError();
  return (await withReplies(connection, rows))[0];
}

async function lockMessage(connection, id) {
  const [rows] = await connection.execute("SELECT id FROM conversations WHERE id = ? FOR UPDATE", [id]);
  if (!rows.length) throw new MessageNotFoundError();
}

async function categoryCounts(connection, studentId) {
  const [rows] = await connection.execute("SELECT categoria, COUNT(*) AS total FROM conversations WHERE usuario_id = ? GROUP BY categoria", [studentId]);
  return Object.fromEntries(Object.entries(CATEGORIES).map(([key, value]) => [key, Number(rows.find((r) => r.categoria === value)?.total ?? 0)]));
}

export function createMessageRepository(pool) {
  return {
    async initialize() { await pool.execute("SELECT id, status FROM conversations LIMIT 0"); },
    async createForStudent(student, input) {
      const category = normalizeCategory(input?.categoria), content = normalizeMessage(input?.mensagem);
      if (!category) throw new MessageValidationError("Categoria inválida.");
      if (!content) throw new MessageValidationError("Não é possível enviar uma mensagem vazia.");
      return transaction(pool, async (connection) => {
        const now = new Date();
        const [created] = await connection.execute(`INSERT INTO conversations
          (usuario_id, categoria, status, nome_aluno_snapshot, ra_snapshot, created_at, updated_at, last_activity_at)
          VALUES (?, ?, 'Pendente', ?, ?, ?, ?, ?)`, [student.id, category, student.nome, student.ra, now, now, now]);
        await connection.execute(`INSERT INTO messages (conversation_id, sender_id, sender_type, content, created_at)
          VALUES (?, ?, 'aluno', ?, ?)`, [created.insertId, student.id, content, now]);
        return loadMessage(connection, created.insertId);
      });
    },
    async updateStatus(messageId, status) {
      if (!MESSAGE_STATUSES.includes(status)) throw new MessageValidationError("Status inválido.");
      return transaction(pool, async (connection) => {
        await lockMessage(connection, messageId);
        await connection.execute("UPDATE conversations SET status = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [status, messageId]);
        return loadMessage(connection, messageId);
      });
    },
    async reply(messageId, manager, input) {
      const content = normalizeMessage(input?.mensagem);
      if (!content) throw new MessageValidationError("Não é possível enviar uma resposta vazia.");
      return transaction(pool, async (connection) => {
        await lockMessage(connection, messageId);
        const now = new Date();
        const [reply] = await connection.execute(`INSERT INTO messages
          (conversation_id, sender_id, sender_type, sender_name_snapshot, content, created_at)
          VALUES (?, ?, 'gestor', ?, ?, ?)`, [messageId, manager.id, manager.nome, content, now]);
        await connection.execute(`UPDATE conversations SET status = 'Respondida', updated_at = ?,
          last_activity_at = GREATEST(last_activity_at, ?) WHERE id = ?`, [now, now, messageId]);
        const mensagem = await loadMessage(connection, messageId);
        return { mensagem, resposta: mensagem.respostas.find((r) => r.id === reply.insertId) };
      });
    },
    async getStudentHistory(studentId, filters = {}) {
      const where = buildMessageFilter({ alunoId: studentId, category: normalizeCategoryFilter(filters.categoria), search: normalizeSearch(filters.busca) });
      return transaction(pool, async (connection) => {
        const [rows] = await connection.execute(ROOT_SELECT + ROOT_FROM + " WHERE " + where.sql + " ORDER BY c.created_at, c.id", where.params);
        return { mensagens: await withReplies(connection, rows), contadores: await categoryCounts(connection, studentId) };
      });
    },
    async listForManager(filters = {}) {
      const where = buildMessageFilter(normalizeManagerFilters(filters));
      return transaction(pool, async (connection) => {
        const [rows] = await connection.execute(`WITH matched AS (
          SELECT c.id, c.usuario_id, c.categoria ${ROOT_FROM} WHERE ${where.sql})
          ${ROOT_SELECT}, EXISTS(SELECT 1 FROM matched x WHERE x.id = c.id) AS matched
          ${ROOT_FROM} WHERE EXISTS(SELECT 1 FROM matched x WHERE x.usuario_id = c.usuario_id AND x.categoria = c.categoria)
          ORDER BY c.last_activity_at DESC, c.id`, where.params);
        const matchingIds = new Set(rows.filter((r) => r.matched).map((r) => r.id));
        rows.forEach((r) => { delete r.matched; });
        const messages = await withReplies(connection, rows);
        const [[counts]] = await connection.execute(`SELECT COUNT(*) AS total,
          COALESCE(SUM(status = 'Pendente'), 0) AS pendentes, COALESCE(SUM(status = 'Em análise'), 0) AS emAnalise,
          COALESCE(SUM(status = 'Respondida'), 0) AS respondidas, COALESCE(SUM(status = 'Resolvida'), 0) AS resolvidas,
          COALESCE(SUM(categoria = 'Pergunta'), 0) AS perguntas, COALESCE(SUM(categoria = 'Reclamação'), 0) AS reclamacoes,
          COALESCE(SUM(categoria = 'Sugestão'), 0) AS sugestoes FROM conversations`);
        const [filterRows] = await connection.execute(`SELECT c.usuario_id AS alunoId,
          COALESCE(c.nome_aluno_snapshot, u.nome) AS nomeAluno, COALESCE(c.ra_snapshot, u.ra) AS ra,
          COALESCE(c.turma_snapshot, u.turma) AS turma FROM conversations c JOIN users u ON u.id = c.usuario_id ORDER BY c.id`);
        return {
          dashboard: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k, Number(v)])),
          conversas: groupConversations(messages, new Set(messages.map(conversationKey)), matchingIds),
          filtros: { alunos: createStudentFilters(filterRows), turmas: [...new Set(filterRows.map((r) => r.turma).filter(Boolean))].sort(localeCompare),
            categorias: Object.entries(CATEGORIES).map(([id,tipo]) => ({id,tipo})), status: MESSAGE_STATUSES },
        };
      });
    },
  };
}

export function normalizeCategory(value) {
  if (typeof value !== "string") return null;
  const category = value.trim();
  return Object.hasOwn(CATEGORIES, category)
    ? CATEGORIES[category]
    : (Object.values(CATEGORIES).includes(category) ? category : null);
}

function normalizeCategoryFilter(value) {
  if (value === null || value === undefined || value === "" || value === "todos") return null;
  const category = normalizeCategory(value);
  if (!category) throw new MessageValidationError("Categoria inválida.");
  return category;
}

export function normalizeManagerFilters(filters) {
  const category = normalizeCategoryFilter(filters.categoria);
  const status = String(filters.status ?? "todos").trim() || "todos";
  if (status !== "todos" && !MESSAGE_STATUSES.includes(status)) {
    throw new MessageValidationError("Status inválido.");
  }

  const alunoId = String(filters.alunoId ?? "").trim();
  if (alunoId && (!/^\d+$/.test(alunoId) || !Number.isSafeInteger(Number(alunoId)) || Number(alunoId) < 1)) {
    throw new MessageValidationError("Aluno inválido.");
  }

  const turma = String(filters.turma ?? "").trim();
  if (turma.length > 80) throw new MessageValidationError("Turma inválida.");

  const dataInicial = normalizeDate(filters.dataInicial ?? filters.dataInicio, "Data inicial inválida.");
  const dataFinal = normalizeDate(filters.dataFinal ?? filters.dataFim, "Data final inválida.", true);
  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new MessageValidationError("A data inicial não pode ser posterior à data final.");
  }

  return {
    category,
    status,
    alunoId: alunoId ? Number(alunoId) : null,
    turma,
    dataInicial,
    dataFinal,
    search: normalizeSearch(filters.busca),
  };
}

function normalizeDate(value, errorMessage, endOfDay = false) {
  if (value === null || value === undefined || value === "") return null;
  const dateValue = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new MessageValidationError(errorMessage);
  const calendarDate = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== dateValue) {
    throw new MessageValidationError(errorMessage);
  }
  // O calendário escolar usa o dia de Brasília (UTC−03:00).
  return Date.parse(`${dateValue}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-03:00`);
}

function normalizeSearch(value) {
  if (typeof value === "string" && value.length > 1_000) throw new MessageValidationError("A busca deve ter no máximo 1000 caracteres.");
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function groupConversations(messages, selectedKeys, matchingIds) {
  const groups = new Map();
  messages.forEach((message) => {
    const key = conversationKey(message);
    if (!selectedKeys.has(key)) return;
    const conversation = groups.get(key) ?? {
      id: key,
      aluno: {
        id: message.alunoId,
        nome: message.nomeAluno,
        ra: message.ra,
        turma: message.turma,
      },
      tipo: message.tipo,
      mensagens: [],
    };
    conversation.mensagens.push(message);
    groups.set(key, conversation);
  });

  return [...groups.values()]
    .map((conversation) => {
      conversation.mensagens.sort(sortOldestFirst);
      const lastMessage = conversation.mensagens.at(-1);
      const latestActivity = conversation.mensagens
        .flatMap((message) => [message, ...(message.respostas ?? [])])
        .sort(sortOldestFirst).at(-1);
      return {
        ...conversation,
        mensagensCorrespondentes: conversation.mensagens.filter((message) => matchingIds.has(message.id)).map((message) => message.id),
        ultimaMensagem: latestActivity.mensagem,
        ultimaAtividade: latestActivity.dataHora,
        status: lastMessage.status,
      };
    })
    .sort((left, right) => Date.parse(right.ultimaAtividade) - Date.parse(left.ultimaAtividade) || localeCompare(left.id, right.id));
}

function createStudentFilters(messages) {
  const students = new Map();
  messages.forEach((message) => {
    students.set(message.alunoId, {
      id: message.alunoId,
      nome: message.nomeAluno,
      ra: message.ra,
      turma: message.turma,
    });
  });
  return [...students.values()].sort((left, right) => localeCompare(left.nome, right.nome));
}

function conversationKey(message) {
  return `${message.alunoId}:${message.tipo}`;
}

function sortOldestFirst(left, right) {
  return Date.parse(left.dataHora) - Date.parse(right.dataHora) || Number(left.id) - Number(right.id);
}

function localeCompare(left, right) {
  return String(left).localeCompare(String(right), "pt-BR", { sensitivity: "base" });
}

export function normalizeMessage(value) {
  if (typeof value !== "string") return "";
  const message = value.trim();
  if (message.length > 1_000) throw new MessageValidationError("O texto deve ter no máximo 1000 caracteres.");
  return message;
}
