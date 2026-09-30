import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
const source = await readFile(new URL("../script.js",import.meta.url),"utf8");
const styles = await readFile(new URL("../styles.css",import.meta.url),"utf8");
function fixture() {
  const classes = new Set();
  const input = {value:"",disabled:false,focus(){}};
  const button = {disabled:true,classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}};
  const historySearch = {value:""};
  const requests = [];
  const context = vm.createContext({document:{querySelector:s=>s==="#messageInput"?input:s==="#sendButton"?button:s==="#historySearch"?historySearch:null,addEventListener(){}},window:{requests},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  vm.runInContext('requestApi = async (url, body) => { if (window.failSend) throw new Error("Falha fictícia"); window.requests.push({url, body}); }; loadMessageHistory = async () => {}; showToast = () => {};',context);
  return {input,button,classes,requests,update:()=>vm.runInContext("updateSendButton()",context),busy:value=>vm.runInContext(`setMessageFormBusy(${value})`,context),category:id=>vm.runInContext(`state.currentCategory = ${JSON.stringify(id)}`,context),submit:()=>vm.runInContext("handleMessageSubmit({preventDefault(){}})",context),fail:()=>{context.window.failSend=true;}};
}
test("envio: vazio/espaços mantêm estado inicial; texto válido escurece e pode enviar",()=>{
  const f=fixture();
  for(const value of [""," \n\t "]){f.input.value=value;f.update();assert.equal(f.button.disabled,true);assert.equal(f.classes.has("send-button--has-text"),false);}
  f.input.value="  Mensagem válida 😀  ";f.update();assert.equal(f.button.disabled,false);assert.equal(f.classes.has("send-button--has-text"),true);
  f.input.value="";f.update();assert.equal(f.button.disabled,true);assert.equal(f.classes.has("send-button--has-text"),false);
});
test("envio: limite, envio em andamento e restauração mantêm disabled correto",()=>{
  const f=fixture();f.input.value="x".repeat(1000);f.update();assert.equal(f.button.disabled,false);
  f.busy(true);assert.equal(f.button.disabled,true);assert.equal(f.input.disabled,true);
  f.busy(false);assert.equal(f.button.disabled,false);assert.equal(f.input.disabled,false);
  f.input.value="x".repeat(1001);f.update();assert.equal(f.button.disabled,true);assert.equal(f.classes.has("send-button--has-text"),false);
});
for (const [id,type] of [["perguntas","Pergunta"],["reclamacoes","Reclamação"],["sugestoes","Sugestão"]]) {
  test(`envio ${type}: envio bem-sucedido limpa texto e restaura botão vazio`,async()=>{
    const f=fixture();f.category(id);f.input.value="  Mensagem de teste  ";f.update();
    assert.equal(f.classes.has("send-button--has-text"),true);
    await f.submit();
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,"/api/mensagens");
    assert.equal(f.requests[0].body.categoria,type);assert.equal(f.requests[0].body.mensagem,"Mensagem de teste");
    assert.equal(f.input.value,"");assert.equal(f.button.disabled,true);assert.equal(f.classes.has("send-button--has-text"),false);assert.equal(f.input.disabled,false);
  });
}
test("envio: falha preserva texto válido e restaura estado ativo",async()=>{
  const f=fixture();f.input.value="Não perder a mensagem";f.update();f.fail();await f.submit();
  assert.equal(f.input.value,"Não perder a mensagem");assert.equal(f.button.disabled,false);assert.equal(f.classes.has("send-button--has-text"),true);assert.equal(f.input.disabled,false);
});
test("botão: fundo ativo escuro sem filtro sobre texto/ícone, geometria ou fundo vazio",()=>{
  const initial=styles.match(/\.send-button\s*\{([^}]+)\}/)[1];
  const active=styles.match(/\.send-button--has-text:not\(:disabled\)\s*\{([^}]+)\}/)[1];
  assert.match(initial,/background:\s*linear-gradient\(105deg, #6e9df6, #8199ec\)/);
  assert.match(initial,/color:\s*var\(--white\)/);assert.match(initial,/box-shadow 150ms ease/);
  assert.match(active,/inset 0 0 0 100px rgba\(0, 0, 0, 0\.4\)/);
  assert.doesNotMatch(active,/(?:filter|color|width|height|padding|margin|position|transform|background)\s*:/);
});
