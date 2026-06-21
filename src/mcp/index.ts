#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { 拡張クライアント } from "./client";
import {
  MCP接続先を表示する,
  MCP接続先を解決する,
} from "./接続先解決";
import { tools } from "./ツール定義";
import { ツールを呼び出す } from "./ツール呼び出し";

const サーバー説明 = `\
VSCode の LSP 機能と内部コマンドを MCP ツールとして公開するサーバー。

## ツール一覧と使い分け

### コード操作
- **rename_symbol** — シンボルのリネーム。LSP 経由で全参照を一括更新する。識別子名の変更はこれを使う（Edit で個別更新すると取りこぼしが起きる）
- **find_symbol** — ワークスペース内のシンボル検索（クラス名・関数名・変数名等）
- **find_referencing_symbols** — 指定位置のシンボルを参照している箇所を列挙
- **rename_file** — ファイルのリネーム。LSP が import パス等を追従更新する

### 診断・状態
- **get_diagnostics** — エラー・警告・情報・ヒントの取得。file 未指定でワークスペース全体
- **get_workspace_status** — 未保存文書・git 変更・問題件数を集約取得。作業開始時に全体状態を把握するのに使う
- **get_document_state** — 個別ファイルの未保存状態と内容
- **save_all_dirty** — 未保存ファイルの一括保存

### コマンド実行
- **list_commands** — VSCode コマンドの検索。filter 引数でキーワード絞り込み可能
- **execute_command** — VSCode コマンドの実行。文字列引数が URI 形式（scheme://...）なら自動的に vscode.Uri に変換される

### 接続確認
- **ping** — VSCode 拡張との接続確認。ワークスペースフォルダも返る

## ファイルを VSCode で開く

execute_command で vscode.open コマンドを使う。パスは file:/// URI 形式で渡す:
  execute_command({ commandId: "vscode.open", args: ["file:///c:/path/to/file.ts"] })

## VSCode コマンドの探し方

1. list_commands({ filter: "キーワード" }) で候補を検索
2. execute_command({ commandId: "コマンドID" }) で実行

## Claude Code の skill 作成支援

このサーバーのツールを組み合わせた Claude Code skill を作る際の指針:
- ファイルを開く/閉じる等の VSCode UI 操作は execute_command 経由で行う
- シンボルのリネームは rename_symbol を使う（grep + Edit の手動置換より確実）
- ファイルのリネームは rename_file を使う（mv + import 手動修正より安全）
- 作業前の状況把握は get_workspace_status + get_diagnostics で行う
- コマンド ID が不明なときは list_commands で検索してから execute_command で実行する
`;

function MCPサーバーを作る(client: 拡張クライアント): Server {
  const server = new Server(
    { name: "megadenryu-vscode-lsp-mcp", version: "0.3.0" },
    { capabilities: { tools: {} }, instructions: サーバー説明 },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    ツールを呼び出す(client, req),
  );
  return server;
}

async function main(): Promise<void> {
  const 接続先 = MCP接続先を解決する(process.env);
  const client = new 拡張クライアント(接続先.ポート);
  const server = MCPサーバーを作る(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[megadenryu-vscode-lsp-mcp] MCP server started: ${MCP接続先を表示する(接続先)}\n`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[megadenryu-vscode-lsp-mcp] fatal: ${message}\n`);
  process.exit(1);
});
