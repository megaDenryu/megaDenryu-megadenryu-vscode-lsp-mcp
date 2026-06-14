import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const renameSymbolSchema = z.object({
  file: z.string().describe("対象シンボルが含まれるファイルの絶対パス"),
  line: z.number().int().min(0).describe("0-origin の行番号"),
  character: z.number().int().min(0).describe("0-origin の桁番号"),
  newName: z.string().min(1).describe("リネーム後の新しい名前"),
  apply: z.boolean().default(true),
});

export const findSymbolSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(500).default(50),
});

export const findReferencingSymbolsSchema = z.object({
  file: z.string(),
  line: z.number().int().min(0),
  character: z.number().int().min(0),
  includeDeclaration: z.boolean().default(false),
});

export const getDiagnosticsSchema = z.object({
  file: z.string().optional(),
  severities: z.array(z.enum(["error", "warning", "info", "hint"])).optional(),
  limit: z.number().int().min(1).max(10000).default(500),
});

export const listCommandsSchema = z.object({
  filter: z.string().optional(),
  limit: z.number().int().min(1).max(10000).default(1000),
  includeInternal: z.boolean().default(false),
});

export const executeCommandSchema = z.object({
  commandId: z.string().min(1),
  args: z.array(z.unknown()).optional(),
});

export const saveAllDirtySchema = z.object({
  includeUntitled: z.boolean().default(false),
});

export const getDocumentStateSchema = z.object({
  file: z.string(),
  includeText: z.boolean().default(false),
});

export const renameFileSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  overwrite: z.boolean().default(false),
  syncPathAttribute: z.boolean().default(true),
});

export const tools: Tool[] = [
  {
    name: "rename_symbol",
    description:
      "VSCode の LSP を使ってシンボルをリネームし、ワークスペース内の全参照を更新する。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "対象ファイルの絶対パス" },
        line: { type: "number", description: "0-origin の行番号" },
        character: { type: "number", description: "0-origin の桁番号" },
        newName: { type: "string", description: "リネーム後の名前" },
        apply: { type: "boolean", default: true },
      },
      required: ["file", "line", "character", "newName"],
    },
  },
  {
    name: "find_symbol",
    description: "VSCode の workspace symbol provider でシンボルを検索する。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", default: 50 },
      },
      required: ["query"],
    },
  },
  {
    name: "find_referencing_symbols",
    description: "指定位置のシンボルを参照する箇所を列挙する。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        line: { type: "number" },
        character: { type: "number" },
        includeDeclaration: { type: "boolean", default: false },
      },
      required: ["file", "line", "character"],
    },
  },
  {
    name: "ping",
    description: "VSCode 拡張との接続と対象ワークスペースを確認する。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_diagnostics",
    description: "VSCode の問題一覧を取得する。file 未指定でワークスペース全体。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        severities: {
          type: "array",
          items: { type: "string", enum: ["error", "warning", "info", "hint"] },
        },
        limit: { type: "number", default: 500 },
      },
    },
  },
  {
    name: "list_commands",
    description: "VSCode のコマンド識別子を一覧する。",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string" },
        limit: { type: "number", default: 1000 },
        includeInternal: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "execute_command",
    description: "VSCode コマンドを実行する。",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        args: { type: "array", items: {} },
      },
      required: ["commandId"],
    },
  },
  {
    name: "get_workspace_status",
    description: "未保存文書、git 変更、問題件数を集約取得する。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_all_dirty",
    description: "未保存の文書を保存する。",
    inputSchema: {
      type: "object",
      properties: {
        includeUntitled: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "get_document_state",
    description: "個別ファイルの未保存状態と現在の内容を取得する。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        includeText: { type: "boolean", default: false },
      },
      required: ["file"],
    },
  },
  {
    name: "rename_file",
    description:
      "VSCode の WorkspaceEdit.renameFile を使い、LSP のファイル名変更処理を伴ってファイルをリネームする。",
    inputSchema: {
      type: "object",
      properties: {
        oldPath: { type: "string" },
        newPath: { type: "string" },
        overwrite: { type: "boolean", default: false },
        syncPathAttribute: { type: "boolean", default: true },
      },
      required: ["oldPath", "newPath"],
    },
  },
];
