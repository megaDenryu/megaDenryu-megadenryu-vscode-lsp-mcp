// セッション 7 検証: rename_file ツールで タイプ.rs → タイプ_LSPテスト.rs を実行し
// LSP participation で mod 宣言 + #[path] 属性が連動更新されるか観測。

import WebSocket from "ws";

const oldPath = "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\型定義\\タイプ.rs";
const newPath = "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\型定義\\タイプ_LSPテスト.rs";

const direction = process.argv[2]; // "forward" or "back"

if (direction !== "forward" && direction !== "back") {
  console.error("Usage: node rename-file-test.mjs forward|back");
  process.exit(2);
}

const task = {
  jsonrpc: "2.0",
  id: direction,
  method: "renameFile",
  params:
    direction === "forward"
      ? { oldPath, newPath, syncPathAttribute: true }
      : { oldPath: newPath, newPath: oldPath, syncPathAttribute: true },
};

const ws = new WebSocket("ws://127.0.0.1:17800");
ws.on("open", () => ws.send(JSON.stringify(task)));
ws.on("message", (raw) => {
  console.log(raw.toString());
  ws.close();
  process.exit(0);
});
ws.on("error", (e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
