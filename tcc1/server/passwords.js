import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1 };
const DERIVED_KEY_LENGTH = 64;

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }

  if (password.length > 128) {
    return "A senha deve ter no máximo 128 caracteres.";
  }

  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, DERIVED_KEY_LENGTH, {
    ...SCRYPT_PARAMETERS,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    SCRYPT_PARAMETERS.N,
    SCRYPT_PARAMETERS.r,
    SCRYPT_PARAMETERS.p,
    salt.toString("base64url"),
    Buffer.from(derivedKey).toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, serializedHash) {
  if (typeof password !== "string" || password.length > 128 || typeof serializedHash !== "string") {
    return false;
  }

  const [algorithm, rawN, rawR, rawP, encodedSalt, encodedHash] = serializedHash.split("$");
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (
    algorithm !== "scrypt" ||
    N !== SCRYPT_PARAMETERS.N ||
    r !== SCRYPT_PARAMETERS.r ||
    p !== SCRYPT_PARAMETERS.p ||
    !encodedSalt ||
    !encodedHash
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedHash = Buffer.from(encodedHash, "base64url");
    if (salt.length !== 16 || expectedHash.length !== DERIVED_KEY_LENGTH) return false;
    const actualHash = Buffer.from(
      await scryptAsync(password, salt, expectedHash.length, {
        N,
        r,
        p,
        maxmem: 64 * 1024 * 1024,
      })
    );

    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
