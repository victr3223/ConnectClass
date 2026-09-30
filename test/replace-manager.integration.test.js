import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import test from "node:test";
import {createConnectClassApp} from "../server/app.js";
import {createUserRepository, DISABLED_ACCOUNT_HASH} from "../server/users.js";
import {createMessageRepository} from "../server/messages.js";
import {replaceManager} from "../server/replace-manager.js";
import {verifyPassword} from "../server/passwords.js";
import {acquireTestDatabase} from "./mysql-fixture.js";
import {runReplacement} from "../scripts/replace-manager.js";
async function fixture(work) {
  const f=await acquireTestDatabase();const oldPassword=randomBytes(24).toString("base64url");let app;
  try {
    app=await createConnectClassApp({database:f.config,managerPassword:oldPassword,logger:{info(){}}});
    await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
    const users=createUserRepository(f.pool), messages=createMessageRepository(f.pool);
    const baseUrl=`http://127.0.0.1:${app.server.address().port}`;
    const old=await users.authenticate("gestor@connectclass.local",oldPassword);
    const student=await users.createStudent({nome:"Aluno fictício da rotação",ra:"009911",turma:"3º A",email:"rotation-student@example.test",senha:"Fixture!2026",confirmacaoSenha:"Fixture!2026"});
    const sent=await messages.createForStudent(student,{categoria:"Pergunta",mensagem:"Preservar histórico"});
    await messages.reply(sent.id,old,{mensagem:"Resposta antiga preservada"});
    await work({...f,users,messages,baseUrl,old,oldPassword,student,sent});
  } finally {await app?.close();await f.release();}
}
async function login(base,email,password){const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identidade:email,senha:password})});return {status:r.status,cookie:r.headers.get("set-cookie")?.split(";")[0]};}
const newPassword=()=>randomBytes(24).toString("base64url");
test("troca: hash nativo, login/Dashboard antes da desativação, sessões antigas e histórico preservados",async()=>fixture(async f=>{
  const before=await f.messages.getStudentHistory(f.student.id);
  const previous=await login(f.baseUrl,"gestor@connectclass.local",f.oldPassword);
  const password=newPassword(),stages=[];
  const options={pool:f.pool,newEmail:"new-manager@example.test",oldEmail:"gestor@connectclass.local",newPassword:password,oldPassword:f.oldPassword,baseUrl:f.baseUrl,onStage:s=>stages.push(s)};
  const result=await replaceManager(options);
  assert.deepEqual(result,{created:true,oldDisabled:true,newLogin:true,dashboard:true});
  assert.deepEqual(stages,["new_manager_confirmed","new_login_confirmed","dashboard_confirmed","old_manager_disabled","replacement_verified"]);
  const [rows]=await f.pool.execute("SELECT email, senha_hash, tipo FROM users WHERE tipo = 'gestor' ORDER BY id");
  assert.equal(rows[0].senha_hash,DISABLED_ACCOUNT_HASH);assert.match(rows[1].senha_hash,/^scrypt\$/);assert.ok(await verifyPassword(password,rows[1].senha_hash));assert.ok(!JSON.stringify(rows).includes(password));
  assert.equal((await login(f.baseUrl,"gestor@connectclass.local",f.oldPassword)).status,401);
  assert.equal((await fetch(f.baseUrl+"/api/gestor",{headers:{Cookie:previous.cookie}})).status,401);
  assert.deepEqual(await f.messages.getStudentHistory(f.student.id),before);
  assert.ok(await f.users.authenticate("009911","Fixture!2026"));
  assert.equal(await f.users.ensureInitialManager("Unrelated!2026"),null);
  assert.equal((await replaceManager(options)).created,false,"Retry não duplica contas nem reseta senha");
}));
test("troca: falha de login ou Dashboard preserva o gestor antigo",async()=>fixture(async f=>{
  for(const failAt of ["login","dashboard"]){
    await assert.rejects(replaceManager({pool:f.pool,newEmail:`${failAt}@example.test`,oldEmail:"gestor@connectclass.local",newPassword:newPassword(),baseUrl:f.baseUrl,
      request:async(_base,path)=>path==="/api/auth/login"&&failAt!=="login"?{status:200,cookie:"fake",body:{user:{id:(await f.pool.execute("SELECT id FROM users WHERE email = ?",[`${failAt}@example.test`]))[0][0].id,tipo:"gestor"}}}:{status:503}}),/não confirmado/);
    assert.ok(await f.users.authenticate("gestor@connectclass.local",f.oldPassword));
  }
}));
test("troca: destino aluno, senha incorreta e identidade igual não alteram contas",async()=>fixture(async f=>{
  for(const values of [{newEmail:f.student.email,newPassword:newPassword()},{newEmail:"gestor@connectclass.local",newPassword:newPassword()}]){
    await assert.rejects(replaceManager({pool:f.pool,oldEmail:"gestor@connectclass.local",baseUrl:f.baseUrl,...values}));
  }
  assert.ok(await f.users.authenticate("gestor@connectclass.local",f.oldPassword));assert.ok(await f.users.authenticate("009911","Fixture!2026"));
}));
test("troca: verificação posterior com falha recupera somente o gestor antigo",async()=>fixture(async f=>{
  await assert.rejects(replaceManager({pool:f.pool,newEmail:"recovery@example.test",oldEmail:"gestor@connectclass.local",newPassword:newPassword(),baseUrl:f.baseUrl,onStage:stage=>{if(stage==="old_manager_disabled")throw Error("Fixture: verificação indisponível");}}));
  assert.ok(await f.users.authenticate("gestor@connectclass.local",f.oldPassword));
  assert.equal((await f.messages.getStudentHistory(f.student.id)).mensagens[0].respostas[0].gestorId,f.old.id);
}));
test("CLI: variáveis temporárias consumidas e banco fora do Compose recusado",async()=>{
  const env={DB_HOST:"127.0.0.1",DB_NAME:"connectclass_final_test",NEW_MANAGER_EMAIL:"new@example.test",NEW_MANAGER_PASSWORD:newPassword(),OLD_MANAGER_EMAIL:"old@example.test"};
  await assert.rejects(runReplacement(env),/Compose/);
  assert.equal(env.NEW_MANAGER_PASSWORD,undefined);assert.equal(env.NEW_MANAGER_EMAIL,undefined);assert.equal(env.OLD_MANAGER_EMAIL,undefined);
});
