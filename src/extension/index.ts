// VSCode 拡張エントリ。activate で WebSocket server を起動し、
// MCP server プロセス (別 Node プロセス) からの JSON-RPC を受け付ける。

import * as vscode from "vscode";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  RpcRequest,
  RpcResponse,
  Request,
} from "../shared/protocol";
import { ホスト, 既定ポート } from "../shared/config";
import {
  find_referencing_symbolsを処理,
  find_symbolを処理,
  pingを処理,
  rename_symbolを処理,
} from "./handlers";

let サーバー: WebSocketServer | undefined;
let 出力チャンネル: vscode.OutputChannel | undefined;
let 接続クライアント数 = 0;

function 設定取得() {
  const conf = vscode.workspace.getConfiguration("megadenryuLspMcp");
  return {
    port: conf.get<number>("port", 既定ポート),
    autoStart: conf.get<boolean>("autoStart", true),
  };
}

function ログ(message: string): void {
  出力チャンネル?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

async function リクエスト処理(req: RpcRequest): Promise<RpcResponse> {
  try {
    switch (req.method) {
      case "ping":
        return { jsonrpc: "2.0", id: req.id, result: await pingを処理() };
      case "renameSymbol":
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: await rename_symbolを処理(
            (req as RpcRequest<Extract<Request, { method: "renameSymbol" }>>).params,
          ),
        };
      case "findSymbol":
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: await find_symbolを処理(
            (req as RpcRequest<Extract<Request, { method: "findSymbol" }>>).params,
          ),
        };
      case "findReferencingSymbols":
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: await find_referencing_symbolsを処理(
            (req as RpcRequest<Extract<Request, { method: "findReferencingSymbols" }>>).params,
          ),
        };
      default:
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: {
            code: -32601,
            message: `未知のメソッド: ${(req as RpcRequest).method}`,
          },
        };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ログ(`リクエスト処理失敗: ${req.method} (${req.id}) -> ${message}`);
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32000, message, data: { method: req.method } },
    };
  }
}

function クライアント接続を捌く(ws: WebSocket): void {
  接続クライアント数 += 1;
  ログ(`MCP クライアント接続: 接続数=${接続クライアント数}`);
  ws.on("message", async (raw) => {
    let req: RpcRequest;
    try {
      req = JSON.parse(raw.toString()) as RpcRequest;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "",
          error: { code: -32700, message: `JSON parse error: ${message}` },
        }),
      );
      return;
    }
    const res = await リクエスト処理(req);
    ws.send(JSON.stringify(res));
  });
  ws.on("close", () => {
    接続クライアント数 -= 1;
    ログ(`MCP クライアント切断: 接続数=${接続クライアント数}`);
  });
  ws.on("error", (err) => {
    ログ(`WebSocket エラー: ${err.message}`);
  });
}

async function サーバー起動(): Promise<void> {
  if (サーバー) return;
  const { port } = 設定取得();
  await new Promise<void>((resolve, reject) => {
    const wss = new WebSocketServer({ host: ホスト, port }, () => {
      サーバー = wss;
      ログ(`WebSocket server listening on ws://${ホスト}:${port}`);
      resolve();
    });
    wss.on("error", (err) => {
      ログ(`WebSocket server エラー: ${err.message}`);
      if (!サーバー) reject(err);
    });
    wss.on("connection", クライアント接続を捌く);
  });
}

async function サーバー停止(): Promise<void> {
  if (!サーバー) return;
  await new Promise<void>((resolve) => {
    サーバー!.close(() => resolve());
  });
  サーバー = undefined;
  ログ("WebSocket server stopped");
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  出力チャンネル = vscode.window.createOutputChannel("megaDenryu LSP MCP");
  context.subscriptions.push(出力チャンネル);
  ログ("activate");

  const 設定 = 設定取得();
  if (設定.autoStart) {
    try {
      await サーバー起動();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ログ(`自動起動失敗: ${message}`);
      void vscode.window.showErrorMessage(
        `megaDenryu LSP MCP 自動起動失敗: ${message}`,
      );
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("megadenryuLspMcp.showStatus", () => {
      const { port } = 設定取得();
      const status = サーバー
        ? `稼働中 (ws://${ホスト}:${port}, 接続数=${接続クライアント数})`
        : "停止中";
      void vscode.window.showInformationMessage(
        `megaDenryu LSP MCP: ${status}`,
      );
      出力チャンネル?.show(true);
    }),
    vscode.commands.registerCommand("megadenryuLspMcp.restartServer", async () => {
      await サーバー停止();
      await サーバー起動();
      void vscode.window.showInformationMessage(
        "megaDenryu LSP MCP: サーバーを再起動しました",
      );
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      void サーバー停止();
    },
  });
}

export async function deactivate(): Promise<void> {
  await サーバー停止();
}
