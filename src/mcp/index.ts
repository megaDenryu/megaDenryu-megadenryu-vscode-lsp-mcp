#!/usr/bin/env node
// MCP server エントリ (stdio)。Claude Code 等から spawn される。
// 受け取ったツール呼び出しを WebSocket 経由で VSCode 拡張に転送する。

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ポート解決 } from "../shared/config";
import { 拡張クライアント } from "./client";

const port = ポート解決(process.env.MEGADENRYU_LSP_MCP_PORT);
const client = new 拡張クライアント(port);

const renameSymbolSchema = z.object({
  file: z.string().describe("対象シンボルが含まれるファイルの絶対パス"),
  line: z.number().int().min(0).describe("0-origin の行番号"),
  character: z.number().int().min(0).describe("0-origin の桁番号"),
  newName: z.string().min(1).describe("リネーム後の新しい名前"),
  apply: z
    .boolean()
    .default(true)
    .describe("true なら workspace.applyEdit まで実施。false ならドライラン (編集内容のみ返す)"),
});

const findSymbolSchema = z.object({
  query: z.string().min(1).describe("シンボル名 (部分一致) または fuzzy 検索クエリ"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe("返却するシンボル数の上限"),
});

const findReferencingSymbolsSchema = z.object({
  file: z.string().describe("参照を調べたいシンボルが定義されているファイルの絶対パス"),
  line: z.number().int().min(0).describe("0-origin 行番号"),
  character: z.number().int().min(0).describe("0-origin 桁番号"),
  includeDeclaration: z
    .boolean()
    .default(false)
    .describe("true なら定義自体も結果に含める"),
});

const getDiagnosticsSchema = z.object({
  file: z.string().optional(),
  severities: z.array(z.enum(["error", "warning", "info", "hint"])).optional(),
  limit: z.number().int().min(1).max(10000).default(500),
});

const listCommandsSchema = z.object({
  filter: z.string().optional(),
  limit: z.number().int().min(1).max(10000).default(1000),
  includeInternal: z.boolean().default(false),
});

const executeCommandSchema = z.object({
  commandId: z.string().min(1),
  args: z.array(z.unknown()).optional(),
});

const saveAllDirtySchema = z.object({
  includeUntitled: z.boolean().default(false),
});

const getDocumentStateSchema = z.object({
  file: z.string(),
  includeText: z.boolean().default(false),
});

const tools: Tool[] = [
  {
    name: "rename_symbol",
    description:
      "VSCode の rust-analyzer / tsserver 等の LSP を使ってシンボルをリネームし、全参照を更新する。cross-crate / cross-file 含めて WorkspaceEdit を atomic に適用する。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "対象シンボルが含まれるファイルの絶対パス" },
        line: { type: "number", description: "0-origin の行番号" },
        character: { type: "number", description: "0-origin の桁番号" },
        newName: { type: "string", description: "リネーム後の新しい名前" },
        apply: {
          type: "boolean",
          description: "true なら適用、false ならドライラン (既定: true)",
          default: true,
        },
      },
      required: ["file", "line", "character", "newName"],
    },
  },
  {
    name: "find_symbol",
    description:
      "VSCode の workspace symbol provider を使ってシンボルを名前検索する。rust-analyzer / tsserver の対象 workspace 全体が対象。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "シンボル名 (部分一致 / fuzzy)" },
        limit: { type: "number", description: "上限 (既定: 50)", default: 50 },
      },
      required: ["query"],
    },
  },
  {
    name: "find_referencing_symbols",
    description:
      "指定位置のシンボルの参照箇所を列挙する (VSCode reference provider 経由)。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "シンボルが含まれるファイルの絶対パス" },
        line: { type: "number", description: "0-origin 行番号" },
        character: { type: "number", description: "0-origin 桁番号" },
        includeDeclaration: {
          type: "boolean",
          description: "定義自体も含めるか (既定: false)",
          default: false,
        },
      },
      required: ["file", "line", "character"],
    },
  },
  {
    name: "ping",
    description:
      "VSCode 拡張との接続疎通確認。拡張バージョンと workspace folder 一覧を返す。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_diagnostics",
    description:
      "VSCode の Problems パネル相当 (rustc / rust-analyzer / tsserver / eslint 等の error/warning) を取得。file 未指定で workspace 全体。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "対象ファイルの絶対パス。未指定で workspace 全体" },
        severities: {
          type: "array",
          items: { type: "string", enum: ["error", "warning", "info", "hint"] },
          description: "取得対象の重要度 (既定: 全部)",
        },
        limit: { type: "number", description: "件数上限 (既定 500)", default: 500 },
      },
    },
  },
  {
    name: "list_commands",
    description:
      "VSCode の全コマンド ID を一覧。filter で部分文字列絞り込み可。組み込みコマンドが数千件あるので filter+limit 推奨。",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "部分文字列 (大文字小文字無視)" },
        limit: { type: "number", description: "上限 (既定 1000)", default: 1000 },
        includeInternal: {
          type: "boolean",
          description: "_ で始まる内部コマンドも含める (既定 false)",
          default: false,
        },
      },
    },
  },
  {
    name: "execute_command",
    description:
      "VSCode の任意のコマンドを実行。引数は JSON 配列。例: workbench.action.files.saveAll は args=[] / workbench.action.reloadWindow は args=[]",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string", description: "VSCode コマンド ID" },
        args: { type: "array", description: "コマンドへの引数配列", items: {} },
      },
      required: ["commandId"],
    },
  },
  {
    name: "get_workspace_status",
    description:
      "未保存文書数・git 変更数・問題件数を集約取得。エクスプローラー/ソース管理/問題タブのバッジ相当。Rename 後の遅延差分監視にも使える。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_all_dirty",
    description:
      "全ての dirty な文書を保存 (vscode.workspace.saveAll)。保存できたファイル一覧を返す。",
    inputSchema: {
      type: "object",
      properties: {
        includeUntitled: {
          type: "boolean",
          description: "Untitled (名前なし新規バッファ) も対象にするか (既定 false)",
          default: false,
        },
      },
    },
  },
  {
    name: "get_document_state",
    description:
      "個別ファイルの dirty 状態 + 現在のテキスト (VSCode メモリ上、未保存変更込み) を取得。includeText=true で本文も返す。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "対象ファイルの絶対パス" },
        includeText: {
          type: "boolean",
          description: "本文も含める (大きいファイルは要注意)",
          default: false,
        },
      },
      required: ["file"],
    },
  },
];

const server = new Server(
  { name: "megadenryu-vscode-lsp-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  try {
    switch (name) {
      case "ping": {
        const result = await client.呼び出し("ping", {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "rename_symbol": {
        const parsed = renameSymbolSchema.parse(args);
        const result = await client.呼び出し("renameSymbol", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "find_symbol": {
        const parsed = findSymbolSchema.parse(args);
        const result = await client.呼び出し("findSymbol", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "find_referencing_symbols": {
        const parsed = findReferencingSymbolsSchema.parse(args);
        const result = await client.呼び出し("findReferencingSymbols", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "get_diagnostics": {
        const parsed = getDiagnosticsSchema.parse(args);
        const result = await client.呼び出し("getDiagnostics", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "list_commands": {
        const parsed = listCommandsSchema.parse(args);
        const result = await client.呼び出し("listCommands", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "execute_command": {
        const parsed = executeCommandSchema.parse(args);
        const result = await client.呼び出し("executeCommand", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "get_workspace_status": {
        const result = await client.呼び出し("getWorkspaceStatus", {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "save_all_dirty": {
        const parsed = saveAllDirtySchema.parse(args);
        const result = await client.呼び出し("saveAllDirty", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "get_document_state": {
        const parsed = getDocumentStateSchema.parse(args);
        const result = await client.呼び出し("getDocumentState", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      default:
        return {
          isError: true,
          content: [{ type: "text", text: `未知のツール: ${name}` }],
        };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout を MCP プロトコルが占有するので、診断は stderr へ。
  process.stderr.write(
    `[megadenryu-vscode-lsp-mcp] MCP server started, expecting VSCode extension on ws://127.0.0.1:${port}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[megadenryu-vscode-lsp-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
