// 既知の動作する struct で dry-run rename → 拡張経路自体の生存確認
import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:17800");
const task = {
  jsonrpc: "2.0",
  id: "dry1",
  method: "renameSymbol",
  params: {
    file: "c:\\devs\\PokemonBattleAI\\pokemon_battle_sim\\src\\バトル\\バトル状態.rs",
    line: 13, // 0-origin, `pub struct バトル状態 {` の行
    character: 11, // 識別子先頭から数文字内
    newName: "バトル状態_DRYRUN",
    apply: false,
  },
};

ws.on("open", () => ws.send(JSON.stringify(task)));
ws.on("message", (raw) => {
  const res = JSON.parse(raw.toString());
  // filesChanged が長くなりすぎるので summary だけ
  if (res.result?.filesChanged) {
    console.log(
      JSON.stringify(
        {
          ...res,
          result: {
            ...res.result,
            filesChanged: `${res.result.filesChanged.length} files (省略)`,
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
