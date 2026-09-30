// Opt-in destructive-lifecycle tests only on a NEW, uniquely named fixture stack.
// Stops/recreates fixture containers, NEVER removes volumes or touches local MySQL.
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createDockerEnvironment } from "../scripts/setup-docker-env.js";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

test("Docker real: funcionalidades, autorização, imagem e volume persistente", { timeout: 1200000 }, async t => {
  const project = `connectclass-e2e-${randomBytes(5).toString("hex")}`;
  await mkdir(join(root,"backups"), {recursive:true});
  const directory = await mkdtemp(join(root,"backups","docker-e2e-"));
  await createDockerEnvironment(directory);
  const credentials = parseEnv(await readFile(join(directory,".env.docker.app"),"utf8"));
  const mysqlCredentials = parseEnv(await readFile(join(directory,".env.docker.mysql"),"utf8"));
  const secrets = [...Object.values(credentials),...Object.values(mysqlCredentials)].filter(value=>value.length>20);
  const dockerEnv = { ...process.env, CONNECTCLASS_APP_ENV_FILE:join(directory,".env.docker.app"),
    CONNECTCLASS_MYSQL_ENV_FILE:join(directory,".env.docker.mysql"), APP_PORT:"0", APP_BIND:"127.0.0.1", PORT:"8081", APP_NODE_ENV:"development" };
  async function docker(args, input = "") {
    try { const pending = exec("docker", args, {cwd:root,env:dockerEnv,windowsHide:true,timeout:420000,maxBuffer:8*1024*1024}); pending.child.stdin.end(input); const {stdout} = await pending; return stdout.trim(); }
    catch (error) {
      const raw = String(error.stderr || error.stdout || error.code || "unknown");
      const safe = secrets.reduce((s,v)=>s.replaceAll(v,"[redacted]"),raw).slice(-2000);
      throw new Error(`Docker fixture command failed: ${safe}`);
    }
  }
  const compose = (...args) => docker(["compose","-p",project,...args]);
  assert.equal(await docker(["ps","-aq","--filter",`label=com.docker.compose.project=${project}`]), "");
  assert.equal(await docker(["volume","ls","-q","--filter",`label=com.docker.compose.project=${project}`]), "");
  await writeFile(join(directory,"fixture.txt"),`project=${project}\nvolume=${project}_mysql_data\n`,{mode:0o600});
  let base, student, manager, ids, volume;
  let managerEmail = "gestor@connectclass.local", managerPassword = credentials.CONNECTCLASS_GESTOR_PASSWORD;
  const studentPassword = randomBytes(24).toString("base64url");
  async function locate() {
    const address = await compose("port","app","8081");
    base = `http://${address}`;
  }
  async function request(path,{method="GET",body,cookie}={}) {
    const response = await fetch(base+path,{method,redirect:"manual",signal:AbortSignal.timeout(10000),
      headers:{...(body?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text(); let data; try { data=JSON.parse(text); } catch { data=null; }
    return {status:response.status,body:data,cookie:response.headers.get("set-cookie")?.split(";")[0]};
  }
  async function checkPersistence() {
    await locate();
    assert.equal((await request("/api/auth/me",{cookie:student.cookie})).status,401);
    student=await request("/api/auth/login",{method:"POST",body:{identidade:"000078",senha:studentPassword}});
    assert.equal(student.status,200);
    const history=await request("/api/mensagens",{cookie:student.cookie});
    assert.equal(history.body.mensagens.length,3);
    const restored=history.body.mensagens.find(m=>m.id===ids[0]);
    assert.equal(restored.status,"Resolvida");
    assert.equal(restored.respostas[0].mensagem,"Resposta Docker persistente 😀");
    manager=await request("/api/auth/login",{method:"POST",body:{identidade:managerEmail,senha:managerPassword}});
    assert.equal(manager.status,200);
    assert.equal((await request("/api/auth/login",{method:"POST",body:{identidade:"gestor@connectclass.local",senha:credentials.CONNECTCLASS_GESTOR_PASSWORD}})).status,401);
    assert.equal(await docker(["volume","inspect",`${project}_mysql_data`,"--format","{{.CreatedAt}}"]),volume);
  }
  try {
    await t.test("subida saudável cria schema automaticamente",async()=>{
      await compose("up","-d","--no-build","--wait","--wait-timeout","360"); await locate();
      const ps=await compose("ps","--format","json");
      const rows=ps.startsWith("[")?JSON.parse(ps):ps.split("\n").filter(Boolean).map(s=>JSON.parse(s));
      assert.equal(rows.length,2); assert.ok(rows.every(row=>row.Health==="healthy"));
      volume=await docker(["volume","inspect",`${project}_mysql_data`,"--format","{{.CreatedAt}}"]);
    });
    await t.test("cadastro e três categorias mantêm aluno sem privilégios de gestor",async()=>{
      student=await request("/api/auth/register",{method:"POST",body:{nome:"Aluno Docker fictício",ra:"000078",email:"docker@example.test",turma:"3º B",senha:studentPassword,confirmacaoSenha:studentPassword,tipo:"gestor"}});
      assert.equal(student.status,201); assert.equal(student.body.user.tipo,"aluno");
      ids=[];
      for(const categoria of ["Pergunta","Reclamação","Sugestão"]){const sent=await request("/api/mensagens",{method:"POST",cookie:student.cookie,body:{categoria,mensagem:`Docker ${categoria} 😀`}});assert.equal(sent.status,201);ids.push(sent.body.mensagem.id);}
      assert.equal((await request("/api/gestor",{cookie:student.cookie})).status,403);
      assert.equal((await request("/api/mensagens")).status,401);
    });
    await t.test("gestor recebe, responde, altera status e filtra dashboard",async()=>{
      manager=await request("/api/auth/login",{method:"POST",body:{identidade:"gestor@connectclass.local",senha:credentials.CONNECTCLASS_GESTOR_PASSWORD}});assert.equal(manager.status,200);
      assert.equal((await request(`/api/gestor/mensagens/${ids[0]}/respostas`,{method:"POST",cookie:manager.cookie,body:{mensagem:"Resposta Docker persistente 😀"}})).status,201);
      assert.equal((await request(`/api/gestor/mensagens/${ids[0]}/status`,{method:"PATCH",cookie:manager.cookie,body:{status:"Resolvida"}})).status,200);
      const filtered=await request("/api/gestor?categoria=perguntas&status=Resolvida&busca=persistente",{cookie:manager.cookie});
      assert.equal(filtered.body.dashboard.total,3); assert.equal(filtered.body.conversas.length,1);
      const history=await request("/api/mensagens",{cookie:student.cookie}); assert.equal(history.body.mensagens.find(m=>m.id===ids[0]).respostas.length,1);
    });
    await t.test("imagem não contém configs/dados JSON; runtime não é root nem tem DDL",async()=>{
      const code=`const fs=await import('node:fs'); if(process.getuid()===0)throw Error('root'); for(const p of ['.env','.env.test','.env.docker.app','.env.docker.mysql','data.json','data/usuarios.json','data/mensagens.json','.git'])if(fs.existsSync(p))throw Error('private file'); if(process.env.MYSQL_ROOT_PASSWORD)throw Error('root credential'); const {default:mysql}=await import('mysql2/promise'); const {databaseConfig}=await import('./server/database/connection.js'); const c=await mysql.createConnection(databaseConfig()); try { await c.query('CREATE TABLE unauthorized_fixture (id INT)'); throw Error('unexpected DDL privilege'); } catch(e) { if(e.code!=='ER_TABLEACCESS_DENIED_ERROR')throw e; } finally {await c.end();} console.log('PASS');`;
      assert.equal(await compose("exec","-T","app","node","--input-type=module","-e",code),"PASS");
    });
    await t.test("troca real do gestor valida novo login/Dashboard e bloqueia conta/sessão antiga sem perder respostas",async()=>{
      const previousCookie = manager.cookie;
      managerEmail = "new-manager@example.test"; managerPassword = randomBytes(24).toString("base64url"); secrets.push(managerPassword);
      const result = JSON.parse(await docker(["compose","-p",project,"exec","-T","app","node","scripts/replace-manager.js","--stdin-env"],
        JSON.stringify({NEW_MANAGER_EMAIL:managerEmail,NEW_MANAGER_PASSWORD:managerPassword,OLD_MANAGER_EMAIL:"gestor@connectclass.local"})));
      assert.equal(result.oldDisabled,true); assert.equal(result.newLogin,true); assert.equal(result.dashboard,true);
      assert.equal((await request("/api/gestor",{cookie:previousCookie})).status,401);
      assert.equal((await request("/api/auth/login",{method:"POST",body:{identidade:"gestor@connectclass.local",senha:credentials.CONNECTCLASS_GESTOR_PASSWORD}})).status,401);
      manager=await request("/api/auth/login",{method:"POST",body:{identidade:managerEmail,senha:managerPassword}});assert.equal(manager.status,200);assert.equal(manager.body.user.tipo,"gestor");
      assert.equal((await request("/api/gestor",{cookie:manager.cookie})).status,200);
      const history=await request("/api/mensagens",{cookie:student.cookie});assert.equal(history.body.mensagens.length,3);assert.equal(history.body.mensagens.find(m=>m.id===ids[0]).respostas[0].mensagem,"Resposta Docker persistente 😀");
    });
    await t.test("restart mantém usuários, mensagens, resposta, status e volume",async()=>{
      await compose("restart"); await compose("up","-d","--no-build","--wait","--wait-timeout","240"); await checkPersistence();
    });
    await t.test("recriar apenas o app mantém dados e volume",async()=>{
      await compose("up","-d","--no-deps","--force-recreate","--no-build","--wait","--wait-timeout","240","app"); await checkPersistence();
    });
    await t.test("down/up preserva volume e aplica schema idempotentemente",async()=>{
      await compose("down"); await compose("up","-d","--no-build","--wait","--wait-timeout","240"); await checkPersistence();
    });
    await t.test("logout invalida sessão e logs não contêm credenciais",async()=>{
      assert.equal((await request("/api/auth/logout",{method:"POST",cookie:student.cookie,body:{}})).status,200);
      assert.equal((await request("/api/auth/me",{cookie:student.cookie})).status,401);
      const logs=await compose("logs","--no-color");
      assert.ok(![...secrets,studentPassword].some(secret=>logs.includes(secret)),"Logs não devem conter segredos.");
    });
  } finally {
    // Preserve named volume and its matching private fixture credentials for recovery.
    await compose("down");
    console.info(`Fixture Docker encerrada; volume preservado: ${project}_mysql_data`);
  }
});
