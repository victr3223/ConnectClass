import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(new URL("../script.js", import.meta.url), "utf8");
function loadStudent(overrides = {}) {
  const controls = new Map();
  const document = {
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, { value: "", disabled: false, setAttribute() {}, removeAttribute() {} });
      return controls.get(selector);
    },
    addEventListener() {},
  };
  const context = vm.createContext({ document, window: {}, URLSearchParams, AbortSignal, ...overrides });
  vm.runInContext(script, context);
  return context;
}

test("verificação inicial atrasada não desfaz um login mais recente", async () => {
  let resolveSession;
  const context = loadStudent({ sessionCheck: new Promise((resolve) => { resolveSession = resolve; }), entered: false });
  vm.runInContext("bindEvents = () => {}; getCurrentUser = () => sessionCheck; showLogin = () => { entered = true; };", context);
  const initial = vm.runInContext("initialize()", context);
  vm.runInContext("++state.authVersion", context);
  resolveSession(null);
  await initial;
  assert.equal(context.entered, false);
});

test("envio do aluno expira sem reenviar e informa resultado incerto", async () => {
  let calls = 0;
  const context = loadStudent({
    fetch: async (_url, options) => {
      calls++;
      assert.ok(options.signal);
      throw new DOMException("Timeout", "TimeoutError");
    },
  });
  await assert.rejects(vm.runInContext('requestApi("/api/mensagens", { mensagem: "Teste" })', context), /Atualize para conferir/);
  assert.equal(calls, 1);
});

test("consulta antiga não sobrescreve histórico retornado pela consulta mais recente", async () => {
  const pending = [];
  const context = loadStudent({ fetch: (_url, options) => {
    assert.ok(options.signal);
    return new Promise((resolve) => pending.push(resolve));
  } });
  vm.runInContext("state.student = {}; renderConversation = () => {}; renderNavigation = () => {};", context);
  const first = vm.runInContext("loadMessageHistory()", context);
  const second = vm.runInContext("loadMessageHistory()", context);
  pending[1]({ status: 200, ok: true, json: async () => ({ mensagens: [{ id: 2 }] }) });
  await second;
  pending[0]({ status: 200, ok: true, json: async () => ({ mensagens: [{ id: 1 }] }) });
  await first;
  assert.equal(vm.runInContext("state.messages[0].id", context), 2);
  assert.equal(vm.runInContext("state.loadingMessages", context), false);
});

test("histórico compartilhado renderiza payload HTML como texto e ordena respostas", async () => {
  const elements = [];
  function element(tag) {
    const node = { tag, dataset: {}, children: [], append(...children) { this.children.push(...children); } };
    Object.defineProperty(node, "innerHTML", { set() { throw new Error("HTML não permitido"); } });
    elements.push(node);
    return node;
  }
  const context = vm.createContext({ window: {}, Intl, Date, document: { createElement: element, createDocumentFragment: () => element("fragment") } });
  vm.runInContext(await readFile(new URL("../message-ui.js", import.meta.url), "utf8"), context);
  context.messages = [{ id: 1, mensagem: '<img src=x onerror="alert(1)">', status: "Pendente", dataHora: "2026-09-20T12:00:00Z", respostas: [{ id: 1, mensagem: "Resposta", dataHora: "2026-09-20T13:00:00Z" }] }];
  vm.runInContext("window.ConnectClassUI.createTimeline(messages)", context);
  assert.deepEqual(elements.filter((node) => node.className === "message-bubble").map((node) => node.textContent), ['<img src=x onerror="alert(1)">', "Resposta"]);
});
