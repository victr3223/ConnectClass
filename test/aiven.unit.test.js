import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bootstrapAiven } from "../scripts/bootstrap-aiven.js";
import * as aivenSetup from "../scripts/bootstrap-aiven.js";

test("Aiven: SHOW GRANTS aceita banco delimitado por ANSI_QUOTES sem ampliar escopo", () => {
  const rows = scope => [{ grant: "GRANT USAGE ON *.* TO fixture" },
    { grant: `GRANT SELECT, INSERT, UPDATE, DELETE ON ${scope} TO fixture` }];
  for (const scope of ["connectclass_preview.*", "`connectclass_preview`.*", '"connectclass_preview".*']) {
    assert.equal(aivenSetup.assertDmlGrants(rows(scope), "connectclass_preview"), true);
  }
  for (const scope of ['"outro_banco".*', "*.*", '"connectclass_preview.*"', '"connectclass_preview".users']) {
    assert.throws(() => aivenSetup.assertDmlGrants(rows(scope), "connectclass_preview"), { code: "EXCESSIVE_APP_PRIVILEGES" });
  }
  assert.throws(() => aivenSetup.assertDmlGrants([{ grant: 'GRANT SELECT, INSERT, UPDATE, DELETE ON "connectclass_preview".* TO fixture WITH GRANT OPTION' }], "connectclass_preview"), { code: "EXCESSIVE_APP_PRIVILEGES" });
});

test("Aiven: destino local, TLS ausente e CA ausente são recusados antes da conexão", async () => {
  for (const env of [{ DB_HOST: "127.0.0.1", DB_SSL: "true", DB_SSL_CA: "fixture" },
    { DB_HOST: "fixture.aivencloud.com", DB_SSL: "false", DB_SSL_CA: "fixture" },
    { DB_HOST: "fixture.aivencloud.com", DB_SSL: "true" }]) {
    await assert.rejects(bootstrapAiven(env), /TLS\/CA/);
  }
});

test("Aiven: configuração privada inválida não é sobrescrita nem exige conexão", async () => {
  const previous = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), "connectclass-aiven-"));
  await writeFile(join(directory, ".env.vercel.preview"), "private fixture");
  try {
    process.chdir(directory);
    await assert.rejects(bootstrapAiven({ DB_HOST: "fixture.aivencloud.com", DB_SSL: "true", DB_SSL_CA: "fixture" }), /configuração privada/i);
    assert.equal(await readFile(".env.vercel.preview", "utf8"), "private fixture");
  } finally { process.chdir(previous); }
});

test("Aiven: diagnóstico preserva etapa, código e SQLSTATE sem mensagem SQL ou senha", () => {
  const diagnostic = aivenSetup.safeAivenFailure(Object.assign(new Error("secret SQL IDENTIFIED BY private-password"),
    { code: "ER_ACCESS_DENIED_ERROR", errno: 1045, sqlState: "28000", stage: "admin-connect" }));
  assert.equal(diagnostic.code, "ER_ACCESS_DENIED_ERROR");
  assert.equal(diagnostic.stage, "admin-connect");
  assert.equal(diagnostic.errno, 1045);
  assert.equal(diagnostic.sqlState, "28000");
  assert.doesNotMatch(JSON.stringify(diagnostic), /private-password|IDENTIFIED BY|secret SQL/);
});

test("Aiven CLI: erro de configuração não imprime dados de entrada ou credenciais", async () => {
  const directory = await mkdtemp(join(tmpdir(), "connectclass-aiven-cli-"));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/bootstrap-aiven.js", import.meta.url))], { cwd: directory, encoding: "utf8", windowsHide: true,
    input: JSON.stringify({ DB_HOST: "localhost", DB_PASSWORD: "never-print-this-fixture" }) });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /never-print-this-fixture|DB_PASSWORD/);
});

test("Aiven PowerShell: executa o Node na raiz solicitada mesmo a partir de outra pasta", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "connectclass aiven launcher "));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(directory, "scripts"));
  await writeFile(join(directory, "scripts", "bootstrap-aiven.js"),
    "console.log(JSON.stringify({cwd:process.cwd(),inspect:process.argv.includes('--inspect')}));");
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const launcher = fileURLToPath(new URL("../scripts/configure-aiven.ps1", import.meta.url));
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `. ${quote(launcher)}; Invoke-AivenBootstrap -ProjectRoot ${quote(directory)} -InputJson '{}' -InspectOnly`],
    { cwd: tmpdir(), encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { cwd: directory, inspect: true });
});

test("Aiven PowerShell 5.1: certificado lido do disco chega ao Node como string PEM", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "connectclass aiven pem "));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(directory, "scripts"));
  const original = fileURLToPath(new URL("../scripts/configure-aiven.ps1", import.meta.url));
  const script = join(directory, "scripts", "configure-aiven.ps1");
  await writeFile(script, await readFile(original));
  const certificate = join(directory, "ca.pem");
  await writeFile(certificate, "PUBLIC CERTIFICATE FIXTURE\n");
  await writeFile(join(directory, "scripts", "bootstrap-aiven.js"),
    "let text='';process.stdin.on('data',d=>text+=d);process.stdin.on('end',()=>{const value=JSON.parse(text).DB_SSL_CA;const passed=typeof value==='string'&&value==='PUBLIC CERTIFICATE FIXTURE\\n';(passed?console.log:console.error)(JSON.stringify(passed?{passed:true,caType:typeof value}:{error:{stage:'certificate',code:'INVALID_CA',message:'PEM was not a string'}}));process.exitCode=passed?0:1;});");
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const responses = ["fixture.aivencloud.com", "16756", "avnadmin", certificate].map(quote).join(",");
  const command = `$global:answers=[Collections.Queue]::new(); foreach($v in @(${responses})){$global:answers.Enqueue($v)}; function Read-Host {param($Prompt,[switch]$AsSecureString) if($AsSecureString){$s=[Security.SecureString]::new();foreach($c in 'fixture-password'.ToCharArray()){$s.AppendChar($c)};$s}else{$global:answers.Dequeue()}}; & ${quote(script)} -InspectOnly`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { cwd: tmpdir(), encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { passed: true, caType: "string" });
});
