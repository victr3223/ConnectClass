import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const writeQueues = new Map();

export class JsonStoreError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "JsonStoreError";
  }
}

export async function ensureJsonFile(filePath, initialValue) {
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new JsonStoreError("Não foi possível verificar o arquivo de dados.", error);
    }

    await writeJson(filePath, clone(initialValue));
  }
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) {
      return clone(fallback);
    }

    if (error instanceof SyntaxError) {
      throw new JsonStoreError("O arquivo de dados contém JSON inválido.", error);
    }

    throw new JsonStoreError("Não foi possível ler o arquivo de dados.", error);
  }
}

export function updateJson(filePath, fallback, mutator) {
  const queued = writeQueues.get(filePath) ?? Promise.resolve();
  const operation = queued.then(async () => {
    const value = await readJson(filePath, fallback);
    const result = await mutator(value);
    await writeJson(filePath, value);
    return result;
  });

  writeQueues.set(filePath, operation.catch(() => undefined));
  return operation;
}

export async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });

  const temporaryPath = `${filePath}.${randomBytes(8).toString("hex")}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  try {
    await writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    throw new JsonStoreError("Não foi possível gravar o arquivo de dados.", error);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
