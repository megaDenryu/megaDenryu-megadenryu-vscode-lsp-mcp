// 拡張が WebSocket を listen しているかの疎通確認用スクリプト (CI / 手動デバッグ用)。
// 対象ワークスペースの登録ポートに ping を投げ、応答内容を stdout に書く。
//
// 使い方:
//   node scripts/ping-check.mjs           # 現在ディレクトリから自動選択
//   node scripts/ping-check.mjs 17801     # ポート指定
//
// 終了コード: 0 成功 / 1 接続エラー / 2 タイムアウト

import WebSocket from "ws";
import { 接続URLを解決する } from "./接続先.mjs";

const url = await 接続URLを解決する(process.argv[2]);

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
