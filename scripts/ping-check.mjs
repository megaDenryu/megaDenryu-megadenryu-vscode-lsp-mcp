// 拡張が WebSocket を listen しているかの疎通確認用スクリプト (CI / 手動デバッグ用)。
// 既定ポート 17800 に ping を投げ、応答内容を stdout に書く。
//
// 使い方:
//   node scripts/ping-check.mjs           # 既定ポート 17800
//   node scripts/ping-check.mjs 17801     # ポート指定
//
// 終了コード: 0 成功 / 1 接続エラー / 2 タイムアウト

import WebSocket from "ws";

const port = process.argv[2] ? Number.parseInt(process.argv[2], 10) : 17800;
const url = `ws://127.0.0.1:${port}`;

const ws = new WebSocket(url);
const timer = setTimeout(() => {
  console.error(`TIMEOUT: ${url} に接続できません (5s)`);
  process.exit(2);
}, 5000);

ws.on("open", () => {
  ws.send(
    JSON.stringify({ jsonrpc: "2.0", id: "ping-check", method: "ping", params: {} }),
  );
});

ws.on("message", (raw) => {
  clearTimeout(timer);
  console.log(raw.toString());
  ws.close();
  process.exit(0);
});

ws.on("error", (err) => {
  clearTimeout(timer);
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
