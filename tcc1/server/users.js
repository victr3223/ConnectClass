import { hashPassword, validatePassword, verifyPassword } from "./passwords.js";
import { ensureJsonFile, readJson, updateJson } from "./json-store.js";

const EMPTY_USERS = { usuarios: [] };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {
  constructor(details) {
    super("Dados inválidos.");
    this.name = "ValidationError";
    this.details = details;
  }
}

export class ConflictError extends Error {
  constructor(field) {
    super("Já existe uma conta com esses dados.");
    this.name = "ConflictError";
    this.field = field;
  }
}

export function createUserRepository(usersFile) {
  return {
    async initialize() {
      await ensureJsonFile(usersFile, EMPTY_USERS);
    },

    async createStudent(input) {
      const fields = validateStudentInput(input);
      if (Object.keys(fields).length > 0) {
        throw new ValidationError(fields);
      }

      const nome = input.nome.trim();
      const ra = input.ra.trim();
      const turma = input.turma.trim();
      const email = normalizeEmail(input.email);
      const senhaHash = await hashPassword(input.senha);
      let createdUser;

      await updateJson(usersFile, EMPTY_USERS, (data) => {
        assertUsersDocument(data);

        if (data.usuarios.some((user) => normalizeRa(user.ra) === normalizeRa(ra))) {
          throw new ConflictError("ra");
        }

        if (data.usuarios.some((user) => normalizeEmail(user.email) === email)) {
          throw new ConflictError("email");
        }

        createdUser = {
          id: nextId(data.usuarios),
          nome,
          ra,
          email,
          senhaHash,
          tipo: "aluno",
          turma,
        };
        data.usuarios.push(createdUser);
      });

      return publicUser(createdUser);
    },

    async authenticate(identity, password) {
      const normalizedIdentity = String(identity ?? "").trim();
      if (!normalizedIdentity || typeof password !== "string") {
        return null;
      }

      const data = await readJson(usersFile, EMPTY_USERS);
      assertUsersDocument(data);
      const normalizedEmail = normalizeEmail(normalizedIdentity);
      const normalizedRa = normalizeRa(normalizedIdentity);
      const user = data.usuarios.find(
        (candidate) =>
          normalizeEmail(candidate.email) === normalizedEmail ||
          normalizeRa(candidate.ra) === normalizedRa
      );

      if (!user || !(await verifyPassword(password, user.senhaHash))) {
        return null;
      }

      return user;
    },

    async findById(id) {
      const data = await readJson(usersFile, EMPTY_USERS);
      assertUsersDocument(data);
      return data.usuarios.find((user) => user.id === id) ?? null;
    },

    async ensureInitialManager(password) {
      let createdManager = null;
      const senhaHash = await hashPassword(password);

      await updateJson(usersFile, EMPTY_USERS, (data) => {
        assertUsersDocument(data);
        if (data.usuarios.some((user) => user.tipo === "gestor")) {
          return;
        }

        createdManager = {
          id: nextId(data.usuarios),
          nome: "Administrador ConnectClass",
          ra: null,
          email: "gestor@connectclass.local",
          senhaHash,
          tipo: "gestor",
          turma: null,
        };
        data.usuarios.push(createdManager);
      });

      return createdManager ? publicUser(createdManager) : null;
    },
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    ra: user.ra ?? null,
    email: user.email,
    tipo: user.tipo,
    turma: user.turma ?? null,
  };
}

function validateStudentInput(input) {
  const errors = {};
  const nome = String(input?.nome ?? "").trim();
  const ra = String(input?.ra ?? "").trim();
  const turma = String(input?.turma ?? "").trim();
  const email = String(input?.email ?? "").trim();
  const passwordError = validatePassword(input?.senha);

  if (!nome) errors.nome = "Informe seu nome completo.";
  else if (nome.length > 120) errors.nome = "O nome deve ter no máximo 120 caracteres.";
  if (!ra) errors.ra = "Informe seu RA.";
  else if (EMAIL_PATTERN.test(ra)) errors.ra = "Informe um RA válido, não um e-mail.";
  else if (ra.length > 40) errors.ra = "O RA deve ter no máximo 40 caracteres.";
  if (!turma) errors.turma = "Informe sua série ou turma.";
  else if (turma.length > 80) errors.turma = "A turma deve ter no máximo 80 caracteres.";
  if (!email) errors.email = "Informe seu e-mail institucional.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Informe um e-mail válido.";
  else if (email.length > 254) errors.email = "O e-mail deve ter no máximo 254 caracteres.";
  if (passwordError) errors.senha = passwordError;
  if (input?.senha !== input?.confirmacaoSenha) {
    errors.confirmacaoSenha = "As senhas não coincidem.";
  }

  return errors;
}

function assertUsersDocument(data) {
  if (!data || !Array.isArray(data.usuarios)) {
    throw new Error("O arquivo usuarios.json não possui a estrutura esperada.");
  }
}

function nextId(users) {
  return users.reduce((highest, user) => Math.max(highest, Number(user.id) || 0), 0) + 1;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeRa(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}
