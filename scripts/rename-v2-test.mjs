// W-203 セッション 5 検証: P1.1 (位置補正) + P1.2 (#[path] 同期) + P2.4 (失敗種別)
//
// 前提: 呼び出し前に以下のダミーファイルがあること
//   pokemon_battle_sim/src/クロス検証用ダミー2.rs (新規)
//   pokemon_battle_sim/src/lib.rs に #[path = "クロス検証用ダミー2.rs"] pub mod クロス検証用ダミー2;
//
// 投入順:
//   1. P2.4: 識別子外の位置 (空白の上) で rename → failureKind="positionNotOnIdentifier"
//   2. P1.1: 識別子末尾 +1 の位置 (識別子外) で rename → positionAdjusted != null + applied=true
//   3. P1.2: pub mod クロス検証用ダミー2 を rename → pathAttributeUpdatesAdded === 1
//
// 検証スクリプトは投入結果を出力するだけで、Rust ファイルの作成・削除は呼び出し側で行う。

import WebSocket from "ws";
import { 接続URLを解決する } from "./接続先.mjs";

const libRsAbs = "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\lib.rs";
// lib.rs の `pub mod クロス検証用ダミー2;` の行を引数から渡す
const modDeclLine = Number.parseInt(process.argv[2] ?? "0", 10);
const identStartChar = Number.parseInt(process.argv[3] ?? "0", 10);
const identEndChar = Number.parseInt(process.argv[4] ?? "0", 10);

if (modDeclLine === 0) {
  console.error("Usage: node rename-v2-test.mjs <modDeclLine> <identStartChar> <identEndChar>");
  process.exit(2);
}

const tasks = [
  // P2.4: 識別子外 (識別子の前の空白) で rename
  {
    id: "p2_4",
    method: "renameSymbol",
    params: {
      file: libRsAbs,
      line: modDeclLine,
      character: 0, // 行頭 ("#" や " " のある場所、必ず識別子外)
      newName: "ダミー名変更",
      apply: false,
    },
  },
  // P1.1: 識別子末尾 + 1 (識別子外) で rename → 補正されて成功するはず
  {
    id: "p1_1",
    method: "renameSymbol",
    params: {
      file: libRsAbs,
      line: modDeclLine,
      character: identEndChar + 1,
      newName: "クロス検証用ダミー2_補正", // 一旦補正テストで投入
      apply: false,
    },
  },
  // P1.2: 識別子上で rename + apply (path 属性も同期されるはず)
  {
    id: "p1_2",
    method: "renameSymbol",
    params: {
      file: libRsAbs,
      line: modDeclLine,
      character: identStartChar + 1,
      newName: "クロス検証用ダミー2改名後",
      apply: true,
    },
  },
];

const ws = new WebSocket(await 接続URLを解決する());
let i = 0;

ws.on("open", () => send());
ws.on("message", (raw) => {
  const res = JSON.parse(raw.toString());
  console.log(`\n=== ${tasks[i].id} (${tasks[i].method}) ===`);
  console.log(JSON.stringify(res, null, 2));
  i++;
  if (i < tasks.length) send();
  else {
    ws.close();
    process.exit(0);
  }
});
ws.on("error", (e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

function send() {
  const t = tasks[i];
  ws.send(JSON.stringify({ jsonrpc: "2.0", id: t.id, method: t.method, params: t.params }));
}
