import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { acquireTestDatabase } from "./mysql-fixture.js";
import { createDatabasePool } from "../server/database/connection.js";
import { createUserRepository } from "../server/users.js";
import { createMessageRepository } from "../server/messages.js";
import { verifyPassword } from "../server/passwords.js";
import { readTransferSnapshot, importTransferSnapshot } from "../scripts/cloud-transfer.js";

async function prepared() {
  const fixture = await acquireTestDatabase();
  const pool = createDatabasePool({ ...fixture.config, dateStrings: true });
  try {
    const password = randomBytes(24).toString("base64url");
    const users = createUserRepository(fixture.pool);
    const manager = await users.ensureInitialManager(password);
    const student = await users.createStudent({ nome: "Aluno Fictício", ra: "000071", turma: "3A", email: "cloud@example.test",
      senha: password, confirmacaoSenha: password });
    const messages = createMessageRepository(fixture.pool);
    const message = await messages.createForStudent(student, { categoria: "Pergunta", mensagem: "Biblioteca: horário? ' % _" });
    await messages.reply(message.id, manager, { mensagem: "Horário fictício: 8h às 17h." });
    const snapshot = await readTransferSnapshot(pool);
    // This guard is inherited from acquireTestDatabase; only the named fictional fixture is cleared.
    for (const table of ["messages", "conversations", "users", "import_batches"]) await pool.execute(`DELETE FROM ${table}`);
    return { fixture, pool, snapshot, password, manager, student, async close() { await pool.end(); await fixture.release(); } };
  } catch (error) { await pool.end(); await fixture.release(); throw error; }
}

test("cloud: cópia preserva IDs, hash nativo, conversa, resposta e status; repetição é idempotente", async () => {
  const state = await prepared();
  try {
    const imported = await importTransferSnapshot(state.pool, state.snapshot, "connectclass_final_test");
    assert.equal(imported.alreadyImported, false);
    const after = await readTransferSnapshot(state.pool);
    assert.deepEqual(after, state.snapshot);
    assert.equal(after.tables.users.length, 2);
    assert.equal(after.tables.messages.length, 2);
    assert.equal(after.tables.conversations[0].status, "Respondida");
    assert.equal(after.tables.users.find(user => user.id === state.student.id).ra, "000071");
    assert.equal(await verifyPassword(state.password, after.tables.users.find(user => user.id === state.manager.id).senha_hash), true);
    assert.equal((await importTransferSnapshot(state.pool, state.snapshot, "connectclass_final_test")).alreadyImported, true);
  } finally { await state.close(); }
});

test("cloud: destino não vazio divergente é preservado sem sobrescrita", async () => {
  const state = await prepared();
  try {
    await importTransferSnapshot(state.pool, state.snapshot, "connectclass_final_test");
    const changed = structuredClone(state.snapshot);
    changed.tables.users[0].nome = "Não sobrescrever";
    await assert.rejects(importTransferSnapshot(state.pool, changed, "connectclass_final_test"), /não vazio/);
    assert.deepEqual(await readTransferSnapshot(state.pool), state.snapshot);
  } finally { await state.close(); }
});

test("cloud: falha de FK reverte a transação inteira sem deixar cadastro parcial", async () => {
  const state = await prepared();
  try {
    state.snapshot.tables.messages[1].sender_id = 999999999;
    await assert.rejects(importTransferSnapshot(state.pool, state.snapshot, "connectclass_final_test"));
    const after = await readTransferSnapshot(state.pool);
    assert.deepEqual(Object.values(after.tables).map(rows => rows.length), [0, 0, 0, 0]);
  } finally { await state.close(); }
});

test("cloud: banco errado e snapshot incompatível são recusados antes de gravar", async () => {
  const state = await prepared();
  try {
    await assert.rejects(importTransferSnapshot(state.pool, state.snapshot, "connectclass"), /divergente/);
    await assert.rejects(importTransferSnapshot(state.pool, { ...state.snapshot, schemaVersion: 2 }, "connectclass_final_test"), /inválido/);
    const malformed = structuredClone(state.snapshot);
    malformed.tables.users[0]["unsafe; DROP"] = "fixture";
    await assert.rejects(importTransferSnapshot(state.pool, malformed, "connectclass_final_test"), /Colunas/);
    const after = await readTransferSnapshot(state.pool);
    assert.deepEqual(Object.values(after.tables).map(rows => rows.length), [0, 0, 0, 0]);
  } finally { await state.close(); }
});
