import { ensureJsonFile, readJson, updateJson } from "./json-store.js";

const EMPTY_MESSAGES = { mensagens: [] };

export const CATEGORIES = Object.freeze({
  perguntas: "Pergunta",
  reclamacoes: "Reclamação",
  sugestoes: "Sugestão",
});

export class MessageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MessageValidationError";
  }
}

export function createMessageRepository(messagesFile) {
  return {
    async initialize() {
      await ensureJsonFile(messagesFile, EMPTY_MESSAGES);
    },

    async createForStudent(student, input) {
      const category = CATEGORIES[input?.categoria];
      const message = normalizeMessage(input?.mensagem);
      if (!category) throw new MessageValidationError("Categoria inválida.");
      if (!message) throw new MessageValidationError("Não é possível enviar uma mensagem vazia.");

      let createdMessage;
      await updateJson(messagesFile, EMPTY_MESSAGES, (data) => {
        assertMessagesDocument(data);
        createdMessage = {
          id: nextId(data.mensagens),
          alunoId: student.id,
          nomeAluno: student.nome,
          ra: student.ra,
          tipo: category,
          mensagem: message,
          dataHora: new Date().toISOString(),
          status: "Pendente",
          respostas: [],
        };
        data.mensagens.push(createdMessage);
      });

      return createdMessage;
    },

    async listForStudent(studentId, { categoria, busca } = {}) {
      const data = await readJson(messagesFile, EMPTY_MESSAGES);
      assertMessagesDocument(data);
      const normalizedSearch = String(busca ?? "").trim().toLocaleLowerCase("pt-BR");
      const selectedCategory = categoria && categoria !== "todos" ? CATEGORIES[categoria] : null;
      if (categoria && categoria !== "todos" && !selectedCategory) {
        throw new MessageValidationError("Categoria inválida.");
      }

      return data.mensagens
        .filter((message) => message.alunoId === studentId)
        .filter((message) => !selectedCategory || message.tipo === selectedCategory)
        .filter((message) => {
          if (!normalizedSearch) return true;
          return `${message.tipo} ${message.mensagem}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
        })
        .sort((left, right) => Date.parse(right.dataHora) - Date.parse(left.dataHora));
    },
  };
}

function normalizeMessage(value) {
  if (typeof value !== "string") return "";
  const message = value.trim().replace(/\s+/g, " ");
  if (!message || message.length > 1_000) return "";
  return message;
}

function assertMessagesDocument(data) {
  if (!data || !Array.isArray(data.mensagens)) {
    throw new Error("O arquivo mensagens.json não possui a estrutura esperada.");
  }
}

function nextId(messages) {
  return messages.reduce((highest, message) => Math.max(highest, Number(message.id) || 0), 0) + 1;
}
