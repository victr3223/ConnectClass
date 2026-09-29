import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const publicDirectory = new URL("../", import.meta.url);
const html = await readFile(new URL("gestor.html", publicDirectory), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const scripts = await Promise.all([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(async ([tag, src]) => ({
  tag, src, source: await readFile(new URL(src.replace(/^\//, ""), publicDirectory), "utf8"),
})));

// Only the document contract and events are modeled; layout is verified in the browser.
class Control {
  value = "";
  listeners = new Map();

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  dispatch(name) {
    const callback = this.listeners.get(name);
    assert.ok(callback, `O controle deve ter um evento ${name}.`);
    return callback({ target: this });
  }
}

function loadManager({ now = "2026-09-05T15:00:00.000Z", overrides = {} } = {}) {
  const controls = new Map(ids.map((id) => [id, new Control()]));
  const clock = Date.parse(now);
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const document = {
    getElementById(id) {
      assert.ok(controls.has(id), `gestor.js referencia #${id}, ausente no HTML.`);
      return controls.get(id);
    },
    addEventListener() {},
  };
  const window = { addEventListener() {}, setTimeout() {}, clearTimeout() {} };
  const context = vm.createContext({ document, window, Date: FixedDate, Intl, AbortSignal, ...overrides });
  for (const script of scripts) vm.runInContext(script.source, context, { filename: script.src });
  return { controls, context };
}

test("painel do gestor mantém controles existentes e carrega o renderizador antes do controlador", () => {
  assert.equal(new Set(ids).size, ids.length, "IDs duplicados tornam os controles ambíguos.");
  assert.ok(scripts.some((script) => script.src === "/gestor.js"));
  assert.ok(scripts.every((script) => /\bdefer\b/.test(script.tag)), "Os scripts precisam aguardar o HTML.");
  const { context } = loadManager();
  // The controller captures its renderer when executed; reversed script order fails here.
  assert.equal(vm.runInContext("typeof ui?.createTimeline", context), "function");
  assert.equal(vm.runInContext("typeof ui?.formatDateTime", context), "function");
});

test("lista administrativa usa hoje, ontem e dia/mês no calendário de Brasília", () => {
  const { context } = loadManager();
  const preview = (value) => vm.runInContext(`formatPreviewTime(${JSON.stringify(value)})`, context);
  assert.equal(preview("2026-09-05T14:30:00.000Z"), "11:30");
  assert.equal(preview("2026-09-05T01:00:00.000Z"), "Ontem", "01h UTC ainda pertence à véspera em Brasília.");
  assert.equal(preview("2026-09-01T15:00:00.000Z"), "01/09");
  assert.equal(preview("data-invalida"), "—");

  const earlyMorning = loadManager({ now: "2026-09-05T01:00:00.000Z" }).context;
  assert.equal(vm.runInContext("formatPreviewTime('2026-09-04T20:00:00.000Z')", earlyMorning), "17:00");
});

test("mudar filtros ou busca invalida o alvo de resposta do resultado anterior", () => {
  const { controls, context } = loadManager({ overrides: { selectedAtLoad: undefined } });
  vm.runInContext(`
    updateSidebarAccessibility = () => {};
    loadManagerData = () => { selectedAtLoad = state.selectedMessageId; };
    bindEvents();
  `, context);
  for (const id of ["managerStatusFilter", "managerStudentFilter", "managerClassFilter", "managerCategoryFilter", "managerStartDate", "managerEndDate"]) {
    vm.runInContext("state.selectedMessageId = 41", context);
    controls.get(id).value = id === "managerStatusFilter" ? "Respondida" : "novo-filtro";
    controls.get(id).dispatch("change");
    assert.equal(context.selectedAtLoad, null, `${id} deve invalidar o atendimento antes da consulta.`);
  }
  vm.runInContext("state.selectedMessageId = 41", context);
  controls.get("managerSearch").value = "nova pesquisa";
  controls.get("managerSearch").dispatch("input");
  assert.equal(vm.runInContext("state.selectedMessageId", context), null);
  assert.equal(vm.runInContext("state.filters.busca", context), "nova pesquisa");
});

test("escrita sem resposta expira, informa resultado incerto e não reenvia automaticamente", async () => {
  for (const operation of [
    { url: "/api/gestor/mensagens/1/respostas", method: "POST", body: '{"mensagem":"Resposta de teste"}' },
    { url: "/api/gestor/mensagens/1/status", method: "PATCH", body: '{"status":"Em análise"}' },
    { url: "/api/auth/logout", method: "POST" },
  ]) {
    let calls = 0;
    let duration;
    const { context } = loadManager({ overrides: {
      operation,
      AbortSignal: {
        timeout(milliseconds) {
          duration = milliseconds;
          const controller = new AbortController();
          queueMicrotask(() => controller.abort(new DOMException("Timeout", "TimeoutError")));
          return controller.signal;
        },
      },
      fetch: async (_url, options) => {
        calls += 1;
        assert.ok(options.signal, "A escrita precisa de prazo máximo.");
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
      },
    } });
    await assert.rejects(vm.runInContext("request(operation.url, operation)", context), /Atualize para conferir o resultado antes de tentar novamente/);
    assert.ok(duration > 0 && duration <= 30_000, "O prazo precisa liberar a interface em tempo razoável.");
    assert.equal(calls, 1, "Repetir uma resposta sem confirmação poderia duplicá-la.");
  }
});
