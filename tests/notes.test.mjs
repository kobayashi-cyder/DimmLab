import test from "node:test";
import assert from "node:assert/strict";
import { readNotes, writeNotes, NOTES_KEY } from "../src/notes.ts";
const note = { id:"example", mission:"percent", prediction:"100円に戻る", observation:"100円→75円", insight:"基準が変わる", savedAt:"2026/11/18" };

test("保存済みのノートを全項目復元する", () => {
  const result=readNotes({getItem: key => {assert.equal(key,NOTES_KEY);return JSON.stringify([note]);}});
  assert.deepEqual(result.notes,[note]);assert.equal(result.warning,"");assert.equal(result.canPersist,true);
});
test("未保存の場合は空のノートで始める", () => {
  assert.deepEqual(readNotes({getItem:()=>null}),{notes:[],warning:"",canPersist:true});
});
test("不正なJSON・配列以外・保存拒否でクラッシュせず上書きを禁止する", () => {
  for(const raw of ["broken","{}","null","42"]) {
    const result=readNotes({getItem:()=>raw});
    assert.deepEqual(result.notes,[]);assert.ok(result.warning);assert.equal(result.canPersist,false);
  }
  const result=readNotes({getItem(){throw Error("SecurityError");}});
  assert.ok(result.warning);assert.equal(result.canPersist,false);
});
test("欠けた項目・未知のミッション・重複IDを除き、有効な記録を保つ", () => {
  const entries=[note,{...note},{...note,id:"other",mission:"physics"},{...note,id:"array",mission:["percent"]},{...note,id:"missing",prediction:undefined},null];
  const result=readNotes({getItem:()=>JSON.stringify(entries)});
  assert.deepEqual(result.notes,[note]);assert.ok(result.warning);assert.equal(result.canPersist,false);
});
test("書き込み成功と容量超過を区別する", () => {
  let saved;
  assert.equal(writeNotes({setItem(key,value){assert.equal(key,NOTES_KEY);saved=value;}},[note]),true);
  assert.deepEqual(JSON.parse(saved),[note]);
  assert.equal(writeNotes({setItem(){throw Error("QuotaExceededError");}},[note]),false);
});
