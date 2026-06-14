// W-203 検証用: クロス検証ダミー構造体 → クロス検証ダミー型 を rename。
// 定義位置: pokemon_battle_sim/src/クロス検証用ダミー.rs line 4 (0-origin), char 11 (struct の名前先頭)
// 期待: cross-crate (pokemon_battle_sim ↔ battle_ai) を含む全 4 箇所が更新される

import WebSocket from "ws";
import { 接続URLを解決する } from "./接続先.mjs";

const ws = new WebSocket(await 接続URLを解決する());
const tasks = [
  { id: "find1", method: "findSymbol", params: { query: "クロス検証ダミー構造体", limit: 10 } },
  {
    id: "refs1",
    method: "findReferencingSymbols",
    params: {
      file: "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\クロス検証用ダミー.rs",
      line: 3,
      character: 11,
      includeDeclaration: true,
    },
  },
  {
    id: "rename1",
    method: "renameSymbol",
    params: {
      file: "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\クロス検証用ダミー.rs",
      line: 3,
      character: 11,
      newName: "クロス検証ダミー型",
      apply: true,
    },
  },
];

let i = 0;
ws.on("open", () => send());
ws.on("message", (raw) => {
  const res = JSON.parse(raw.toString());
  console.log(`=== ${tasks[i].method} (id=${res.id}) ===`);
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
