// P1.2 (#[path] 同期) を既存の `#[path = "タイプ.rs"] pub mod タイプ;` で dry-run 検証。
// apply=false で実害なし。pathAttributeUpdatesAdded === 1 が期待される。

import WebSocket from "ws";
import { 接続URLを解決する } from "./接続先.mjs";

const ws = new WebSocket(await 接続URLを解決する());
const task = {
  jsonrpc: "2.0",
  id: "path1",
  method: "renameSymbol",
  params: {
    file: "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\型定義\\mod.rs",
    line: 1, // 0-origin、`pub mod タイプ;` の行
    character: 9, // 識別子 "タイプ" の真ん中
    newName: "タイプ_DRYRUN",
    apply: false,
  },
};

ws.on("open", () => ws.send(JSON.stringify(task)));
ws.on("message", (raw) => {
  const res = JSON.parse(raw.toString());
  // filesChanged から #[path] 同期の追加編集がどう注入されたかを確認したい。
  // mod.rs の編集だけ抜き出して詳細表示、他は要約。
  if (res.result?.filesChanged && Array.isArray(res.result.filesChanged)) {
    const 詳細 = res.result.filesChanged.find((f) =>
      f.file.endsWith("型定義\\mod.rs") || f.file.endsWith("型定義/mod.rs"),
    );
    console.log(
      JSON.stringify(
        {
          ...res,
          result: {
            ...res.result,
            filesChanged: `${res.result.filesChanged.length} files (mod.rs 詳細のみ表示)`,
            modRs詳細: 詳細,
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
  ws.close();
  process.exit(0);
});
ws.on("error", (e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
