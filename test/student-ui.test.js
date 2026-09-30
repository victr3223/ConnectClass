import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
const source = await readFile(new URL("../script.js",import.meta.url),"utf8");
function fixture() {
  const classes = new Set();
  const input = {value:"",disabled:false};
  const button = {disabled:true,classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}};
  const context = vm.createContext({document:{querySelector:s=>s==="#messageInput"?input:s==="#sendButton"?button:null,addEventListener(){}},window:{},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  return {input,button,classes,update:()=>vm.runInContext("updateSendButton()",context),busy:value=>vm.runInContext(`setMessageFormBusy(${value})`,context)};
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
