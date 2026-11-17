// React's renderer exercises the real component state and event handlers.
// These tests do not verify browser rendering or DOM focus.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import ts from "typescript";
import React from "react";
import renderer, { act } from "react-test-renderer";

const project=fileURLToPath(new URL("../",import.meta.url));
const build=mkdtempSync(join(project,".test-build-"));
const source=readFileSync(join(project,"src/App.tsx"),"utf8");
const transformed=ts.transpileModule(source,{
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}
}).outputText.replace('from "./notes"','from "../src/notes.ts"');
writeFileSync(join(build,"App.mjs"),transformed);
const {default:App}=await import(pathToFileURL(join(build,"App.mjs")).href);
after(()=>rmSync(build,{recursive:true,force:true}));

function text(node) {
  if(typeof node==="string"||typeof node==="number")return String(node);
  return (node?.children||[]).map(text).join("");
}
function mount({raw=null,quota=false,denied=false}={}) {
  let saved=raw,writes=0,view;
  globalThis.window={};
  Object.defineProperty(window,"localStorage",{get(){
    if(denied)throw Error("SecurityError");
    return {getItem:()=>saved,setItem:(_,value)=>{
      if(quota)throw Error("QuotaExceededError");
      writes++;saved=value;
    }};
  }});
  act(()=>{view=renderer.create(React.createElement(App));});
  function click(label) {
    const button=view.root.findAllByType("button").find(b=>text(b).includes(label));
    assert.ok(button,"button: "+label);
    assert.ok(!button.props.disabled,"button enabled: "+label);
    act(()=>button.props.onClick());
  }
  return {
    view,click,allText:()=>text(view.toJSON()),
    buttons:()=>view.root.findAllByType("button"),saved:()=>saved,writes:()=>writes,
    changeRange(index,value){act(()=>view.root.findAllByType("input")[index].props.onChange({target:{value:String(value)}}));},
    unmount(){act(()=>view.unmount());}
  };
}
function finish(app) {
  app.click("100円に戻る");app.click("この予想で実験する");
  app.click("別の問題で試す");app.click("192円");
  app.click("発見をまとめる");app.click("発見ノートに保存");
}
test("割合を完了し予想・実験・発見を保存、再起動で復元する",()=>{
  const app=mount();assert.equal(app.writes(),0);
  app.click("最初の実験を始める");finish(app);
  const notes=JSON.parse(app.saved());
  assert.equal(notes.length,1);assert.equal(notes[0].prediction,"100円に戻る");
  assert.match(notes[0].observation,/75\.0円/);assert.match(app.allText(),/保存しました/);
  app.unmount();
  const reload=mount({raw:JSON.stringify(notes)});
  assert.match(reload.allText(),/発見したミッション 1 \/ 3/);
  reload.click("発見ノート (");assert.match(reload.allText(),/100円に戻る/);
  reload.unmount();
});
test("予想を選ぶまで進めず、ヒントと選択状態を示す",()=>{
  const app=mount();app.click("最初の実験を始める");
  assert.equal(app.buttons().find(b=>text(b).includes("この予想で")).props.disabled,true);
  app.click("ヒントを見る");assert.match(app.allText(),/どの時点の価格/);
  app.click("100円より安くなる");
  assert.equal(app.buttons().find(b=>text(b).includes("100円より安くなる")).props["aria-pressed"],true);
  app.click("この予想で実験する");assert.match(app.allText(),/予想どおり/);app.unmount();
});
test("再挑戦で問いに対応する初期条件へ戻る",()=>{
  const app=mount();app.click("最初の実験を始める");
  app.click("100円に戻る");app.click("この予想で実験する");
  app.changeRange(0,500);app.changeRange(1,100);app.changeRange(2,0);
  app.click("ミッション一覧");app.click("最初の実験を始める");
  app.click("100円に戻る");app.click("この予想で実験する");
  assert.deepEqual(app.view.root.findAllByType("input").map(x=>x.props.value),[100,50,50]);app.unmount();
});
test("コインは実験まで進めず、回数変更で古い結果を無効にする",()=>{
  const app=mount();app.click("確率の錯覚");app.click("表と裏は同じ確率");app.click("この予想で実験する");
  const next=()=>app.buttons().find(b=>text(b).includes("別の問題で試す"));
  assert.equal(next().props.disabled,true);
  app.click("コインを投げる");assert.equal(next().props.disabled,false);
  app.changeRange(0,200);assert.equal(next().props.disabled,true);
  app.click("コインを投げる");app.click("別の問題で試す");app.click("1/6");
  app.click("発見をまとめる");app.click("発見ノートに保存");
  assert.match(JSON.parse(app.saved())[0].observation,/200回中/);app.unmount();
});
test("増え方の実験と応用を完了し、自分の言葉を保存する",()=>{
  const app=mount();app.click("増え方の錯覚");app.click("128個");app.click("この予想で実験する");
  assert.match(app.allText(),/128個/);
  app.changeRange(0,4);app.changeRange(1,3);
  assert.match(app.allText(),/27個/);
  app.click("別の問題で試す");app.click("24個");app.click("発見をまとめる");
  act(()=>app.view.root.findByType("textarea").props.onChange({target:{value:"増える量も変化する"}}));
  app.click("発見ノートに保存");
  const note=JSON.parse(app.saved())[0];
  assert.equal(note.insight,"増える量も変化する");assert.match(note.observation,/4日目: 27個/);app.unmount();
});
test("保存失敗でもノートを画面に残し、永続保存できなかったと知らせる",()=>{
  const app=mount({quota:true});app.click("最初の実験を始める");finish(app);
  assert.equal(app.saved(),null);assert.match(app.allText(),/保存できませんでした/);
  assert.match(app.allText(),/100円に戻る/);app.unmount();
});
test("壊れたデータを起動時も新しいノート保存時も上書きしない",()=>{
  const app=mount({raw:"broken"});assert.equal(app.writes(),0);
  app.click("最初の実験を始める");finish(app);
  assert.equal(app.saved(),"broken");assert.equal(app.writes(),0);
  assert.match(app.allText(),/元の記録を保護/);app.unmount();
});
test("保存領域へのアクセス自体が拒否されても学習を続ける",()=>{
  const app=mount({denied:true});app.click("最初の実験を始める");finish(app);
  assert.match(app.allText(),/この画面内だけ/);app.unmount();
});
