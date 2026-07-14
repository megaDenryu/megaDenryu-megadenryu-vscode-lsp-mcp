// セッション 6 追加 6 ツール (get_diagnostics / list_commands / execute_command
// / get_workspace_status / save_all_dirty / get_document_state) の動作確認。

import WebSocket from "ws";
import { 接続URLを解決する } from "./接続先.mjs";

const tasks = [
  { id: "ping", method: "ping", params: {} },
  {
    id: "diag-all",
    method: "getDiagnostics",
    params: { limit: 5, severities: ["error", "warning"] },
  },
  {
    id: "list-cmd",
    method: "listCommands",
    params: { filter: "rust", limit: 20 },
  },
  {
    id: "exec-cmd",
    method: "executeCommand",
    params: { commandId: "workbench.action.files.saveAll", args: [] },
  },
  { id: "ws-status", method: "getWorkspaceStatus", params: {} },
  { id: "save-all", method: "saveAllDirty", params: { includeUntitled: false } },
  {
    id: "doc-state",
    method: "getDocumentState",
    params: {
      file: "c:\\devs\\PokemonBattleAI\\Cargo.toml",
      includeText: false,
    },
  },
];

const ws = new WebSocket(await 接続URLを解決する());
let i = 0;

ws.on("open", () => send());
ws.on("message", (raw) => {
  const res = JSON.parse(raw.toString());
  console.log(`\n=== ${tasks[i].id} (${tasks[i].method}) ===`);
  // 大きすぎる配列は要約
  if (res.result?.commands && Array.isArray(res.result.commands)) {
    console.log(
      JSON.stringify(
        {
          ...res,
          result: {
            commands: `[${res.result.commands.length} 件] ${res.result.commands.slice(0, 5).join(", ")}${res.result.commands.length > 5 ? ", ..." : ""}`,
            truncated: res.result.truncated,
          },
        },
        null,
        2,
      ),
    );
  } else if (res.result?.diagnostics && Array.isArray(res.result.diagnostics)) {
    console.log(
      JSON.stringify(
        {
          ...res,
          result: {
            diagnostics: `[${res.result.diagnostics.length} 件] サンプル: ${JSON.stringify(res.result.diagnostics[0] ?? null)}`,
            truncated: res.result.truncated,
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
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
