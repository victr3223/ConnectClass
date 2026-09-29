import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Only executable application sources; the archived design is not part of this app.
const directories = [".", "server", "scripts", "test"];
async function collect(directory) {
  const result = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".js")) result.push(resolve(root, directory, entry.name));
    else if (directory !== "." && entry.isDirectory()) result.push(...await collect(`${directory}/${entry.name}`));
  }
  return result;
}
let checked = 0;
for (const directory of directories) {
  for (const file of await collect(directory)) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || `${file}: erro de sintaxe`);
    checked++;
  }
}
for (const name of ["index.html", "gestor.html"]) {
  const html = await readFile(resolve(root, name), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${name}: IDs duplicados`);
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /name="viewport"/);
  assert.doesNotMatch(html, /\son\w+=|<script\b(?![^>]*\bsrc=)/i, `${name}: JavaScript inline viola CSP`);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith("#")) continue;
    assert.doesNotMatch(url, /^(https?:|\/\/|\.\.)/);
    assert.ok((await stat(resolve(root, url.replace(/^\//, "")))).isFile(), `${name}: asset ausente ${url}`);
  }
}
for (const name of ["styles.css", "manager.css"]) {
  const css = (await readFile(resolve(root, name), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, `${name}: chaves desbalanceadas`);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i, `${name}: dependência externa inesperada`);
}
JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
console.info(`PASSOU: sintaxe de ${checked} arquivos JS; contratos HTML/assets; sanidade CSS/JSON. Não substitui um validador completo de HTML/CSS.`);
