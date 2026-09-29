import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { acquireTestDatabase } from "./mysql-fixture.js";
import { createUserRepository } from "../server/users.js";
import { createMessageRepository } from "../server/messages.js";
import { hashPassword } from "../server/passwords.js";
import { importJson } from "../server/database/import-json.js";

const input = (id = 1) => ({ nome: "Aluno de teste", ra: `00${id}`, turma: "3º A", email: `fixture${id}@example.test`, senha: "Fixture!2026", confirmacaoSenha: "Fixture!2026" });

async function withFixture(work) {
  const f = await acquireTestDatabase();
  try { await work(f); } finally { await f.release(); }
}

test("MySQL: conta de testes não acessa banco principal nem cria tabelas", async () => withFixture(async ({ pool }) => {
  await assert.rejects(pool.execute("SELECT COUNT(*) FROM connectclass.users"), (e) => ["ER_TABLEACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR"].includes(e.code));
  await assert.rejects(pool.execute("CREATE TABLE forbidden_fixture (id INT)"), (e) => e.code === "ER_TABLEACCESS_DENIED_ERROR");
}));

test("MySQL: gestor concorrente é único e senha existente nunca é redefinida", async () => withFixture(async ({ pool }) => {
  const users = createUserRepository(pool);
  await assert.rejects(users.ensureInitialManager(undefined), /CONNECTCLASS_GESTOR_PASSWORD/);
  const result = await Promise.all([users.ensureInitialManager("Fixture!2026"),users.ensureInitialManager("Fixture!2026")]);
  assert.equal(result.filter(Boolean).length,1);
  assert.equal(await users.ensureInitialManager("OutraFixture!2026"),null);
  assert.ok(await users.authenticate("gestor@connectclass.local","Fixture!2026"));
  assert.equal(await users.authenticate("gestor@connectclass.local","OutraFixture!2026"),null);
}));

test("MySQL: injeção é literal, RA mantém zeros e busca respeita acentos e curingas", async () => withFixture(async ({ pool }) => {
  const users = createUserRepository(pool), messages = createMessageRepository(pool);
  const student = await users.createStudent(input());
  assert.equal((await users.authenticate("001",input().senha)).id,student.id);
  assert.equal(await users.authenticate("' OR 1=1 --",input().senha),null);
  await messages.createForStudent(student,{categoria:"perguntas",mensagem:"50%_ de atenção 😀"});
  assert.equal((await messages.getStudentHistory(student.id,{busca:"%_"})).mensagens.length,1);
  assert.equal((await messages.getStudentHistory(student.id,{busca:"atencao"})).mensagens.length,0);
  assert.equal((await messages.getStudentHistory(student.id,{busca:"ATENÇÃO"})).mensagens.length,1);
  assert.equal((await messages.listForManager({busca:"' OR 1=1 --"})).conversas.length,0);
  await assert.rejects(users.createStudent({...input(2),email:input().email.toUpperCase()}), (e)=>e.field==="email");
}));

test("MySQL: falha na primeira mensagem reverte atendimento e FKs impedem remoção de histórico", async () => withFixture(async ({ pool }) => {
  const users=createUserRepository(pool), messages=createMessageRepository(pool);
  const manager=await users.ensureInitialManager("Fixture!2026");
  await assert.rejects(messages.createForStudent({...manager,ra:"fake"},{categoria:"perguntas",mensagem:"Não gravar"}), (e)=>e.code==="ER_NO_REFERENCED_ROW_2");
  const [[count]]=await pool.execute("SELECT COUNT(*) AS n FROM conversations"); assert.equal(count.n,0);
  const student=await users.createStudent(input());
  const sent=await messages.createForStudent(student,{categoria:"sugestoes",mensagem:"Preservar"});
  await assert.rejects(pool.execute("DELETE FROM users WHERE id = ?",[student.id]), (e)=>e.code==="ER_ROW_IS_REFERENCED_2");
  await assert.rejects(pool.execute("DELETE FROM conversations WHERE id = ?",[sent.id]), (e)=>e.code==="ER_ROW_IS_REFERENCED_2");
}));

test("MySQL: importação reconcilia usuários, atendimentos e respostas, preserva hashes e é idempotente", async () => withFixture(async ({ pool }) => {
  const directory=await mkdtemp(join(tmpdir(),"connectclass-import-fixture-"));
  try {
    const hash=await hashPassword("Fixture!2026");
    const users=[{id:10,nome:"Aluno fictício",ra:"0007",email:"aluno@example.test",senhaHash:hash,tipo:"aluno",turma:"3º A"},
      {id:20,nome:"Gestor fictício",ra:null,email:"gestor@connectclass.local",senhaHash:hash,tipo:"gestor",turma:null}];
    const messages=[{id:30,alunoId:10,nomeAluno:"Aluno fictício",ra:"0007",tipo:"Pergunta",mensagem:"Horário?",status:"Resolvida",dataHora:"2026-09-01T10:00:00.123Z",
      respostas:[{id:7,mensagemId:30,gestorId:20,nomeGestor:"Gestor fictício",mensagem:"Às 9h 😀",dataHora:"2026-09-02T11:00:00.456Z"}]}];
    await writeFile(join(directory,"usuarios.json"),JSON.stringify({usuarios:users}));
    await writeFile(join(directory,"mensagens.json"),JSON.stringify({mensagens:messages}));
    const before=await Promise.all(["usuarios.json","mensagens.json"].map((name)=>readFile(join(directory,name))));
    const result=await importJson(pool,directory);
    assert.deepEqual(result,{alreadyImported:false,users:2,conversations:1,messages:2,replies:1});
    assert.deepEqual(await importJson(pool,directory),{...result,alreadyImported:true});
    const [[stored]]=await pool.execute("SELECT senha_hash FROM users WHERE id = ?",[10]);
    assert.ok(stored.senha_hash===hash);
    const history=await createMessageRepository(pool).getStudentHistory(10);
    assert.equal(history.mensagens[0].id,30);
    assert.equal(history.mensagens[0].dataHora,messages[0].dataHora);
    assert.equal(history.mensagens[0].status,"Resolvida");
    assert.deepEqual(history.mensagens[0].respostas,messages[0].respostas);
    const next=await createMessageRepository(pool).reply(30,{id:20,nome:"Gestor fictício"},{mensagem:"Novo retorno"});
    assert.ok(next.resposta.id>7);
    const after=await Promise.all(["usuarios.json","mensagens.json"].map((name)=>readFile(join(directory,name))));
    assert.ok(before.every((bytes,i)=>bytes.equals(after[i])));
    messages[0].mensagem="Origem diferente";
    await writeFile(join(directory,"mensagens.json"),JSON.stringify({mensagens:messages}));
    await assert.rejects(importJson(pool,directory),/Destino não vazio/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+"\\") || resolve(directory).startsWith(resolve(tmpdir())+"/"));
    await rm(directory,{recursive:true,force:true});
  }
}));

test("MySQL: importação inválida/corrompida não grava usuários nem altera originais", async () => withFixture(async ({ pool }) => {
  const directory=await mkdtemp(join(tmpdir(),"connectclass-invalid-fixture-"));
  try {
    await writeFile(join(directory,"usuarios.json"),"{invalid");
    await writeFile(join(directory,"mensagens.json"),JSON.stringify({mensagens:[]}));
    await assert.rejects(importJson(pool,directory),/Importação recusada/);
    assert.equal(await readFile(join(directory,"usuarios.json"),"utf8"),"{invalid");
    const [[count]]=await pool.execute("SELECT COUNT(*) AS n FROM users"); assert.equal(count.n,0);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+"\\") || resolve(directory).startsWith(resolve(tmpdir())+"/"));
    await rm(directory,{recursive:true,force:true});
  }
}));
