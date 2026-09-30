import { hashPassword, validatePassword, verifyPassword } from "./passwords.js";



const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Not a password/hash: a disabled account keeps its ID and historical replies.
export const DISABLED_ACCOUNT_HASH = "!disabled!";

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

const USER_COLUMNS = "id, nome, ra, email, senha_hash AS senhaHash, tipo, turma";

export function createUserRepository(pool) {
  return {
    async initialize() { await pool.execute("SELECT " + USER_COLUMNS + " FROM users LIMIT 0"); },
    async createStudent(input) {
      const fields = validateStudentInput(input);
      if (Object.keys(fields).length) throw new ValidationError(fields);
      const user = { nome: input.nome.trim(), ra: input.ra.trim(), turma: input.turma.trim(),
        email: normalizeEmail(input.email), senhaHash: await hashPassword(input.senha), tipo: "aluno" };
      try {
        const [result] = await pool.execute(
          "INSERT INTO users (nome, ra, turma, email, senha_hash, tipo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'aluno', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
          [user.nome, user.ra, user.turma, user.email, user.senhaHash]);
        return publicUser({ ...user, id: result.insertId });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") throw new ConflictError(error.sqlMessage?.includes("uq_users_ra") ? "ra" : "email");
        throw error;
      }
    },
    async authenticate(identity, password) {
      if (typeof identity !== "string" || identity.length > 254 || typeof password !== "string" || password.length > 128 || !password.length) return null;
      const normalized = normalizeEmail(identity);
      if (!normalized) return null;
      const [rows] = await pool.execute("SELECT " + USER_COLUMNS + " FROM users WHERE email = ? OR ra = ? ORDER BY id LIMIT 1", [normalized, normalizeRa(identity)]);
      const user = rows[0];
      return user && await verifyPassword(password, user.senhaHash) ? user : null;
    },
    async findById(id) {
      const [rows] = await pool.execute("SELECT " + USER_COLUMNS + " FROM users WHERE id = ? AND senha_hash <> ?", [id, DISABLED_ACCOUNT_HASH]);
      return rows[0] ?? null;
    },
    async listStudents() {
      const [rows] = await pool.execute("SELECT id, nome, ra, email, tipo, turma FROM users WHERE tipo = 'aluno' ORDER BY id");
      return rows.map(publicUser);
    },
    async ensureInitialManager(password) {
      const connection = await pool.getConnection();
      let locked = false;
      try {
        const [[lock]] = await connection.execute("SELECT GET_LOCK(CONCAT('connectclass:manager:', DATABASE()), 10) AS acquired");
        if (lock.acquired !== 1) throw new Error("Bootstrap ocupado.");
        locked = true;
        const [existing] = await connection.execute("SELECT id FROM users WHERE tipo = 'gestor' AND senha_hash <> ? LIMIT 1", [DISABLED_ACCOUNT_HASH]);
        if (existing.length) return null;
        if (password === undefined) throw new Error("Configure CONNECTCLASS_GESTOR_PASSWORD para criar o primeiro gestor.");
        const error = validatePassword(password);
        if (error) throw new ValidationError({ senha: error });
        const manager = {nome: "Administrador ConnectClass", ra: null, turma: null, email: "gestor@connectclass.local", tipo: "gestor"};
        const [result] = await connection.execute(
          "INSERT INTO users (nome, email, senha_hash, tipo, created_at, updated_at) VALUES (?, ?, ?, 'gestor', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
          [manager.nome, manager.email, await hashPassword(password)]);
        return publicUser({ ...manager, id: result.insertId });
      } finally {
        if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT('connectclass:manager:', DATABASE()))").catch(() => {});
        connection.release();
      }
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

export function validateStudentInput(input) {
  const errors = {};
  const nome = typeof input?.nome === "string" ? input.nome.trim() : "";
  const ra = typeof input?.ra === "string" ? input.ra.trim() : "";
  const turma = typeof input?.turma === "string" ? input.turma.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim() : "";
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

function normalizeEmail(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeRa(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}
