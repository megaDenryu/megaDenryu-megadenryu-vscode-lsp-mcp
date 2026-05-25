// 拡張 ⇔ MCP server 間の WebSocket JSON-RPC プロトコル定義。
// LSP プロトコルそのものではなく、本拡張が公開する高レベル MCP ツールに対応した
// リクエスト/レスポンス型のみを定義する。

export type 位置 = {
  file: string;
  line: number; // 0-origin (LSP 同様)
  character: number; // 0-origin
};

export type テキスト編集 = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
};

export type ファイル編集 = {
  file: string;
  edits: テキスト編集[];
};

export type シンボル情報 = {
  name: string;
  kind: string;
  file: string;
  line: number;
  character: number;
  containerName?: string;
};

export type 参照情報 = {
  file: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
};

// ===== リクエスト型 =====

export type RenameSymbolRequest = {
  method: "renameSymbol";
  params: 位置 & { newName: string; apply: boolean };
};

export type FindSymbolRequest = {
  method: "findSymbol";
  params: { query: string; limit?: number };
};

export type FindReferencingSymbolsRequest = {
  method: "findReferencingSymbols";
  params: 位置 & { includeDeclaration?: boolean };
};

export type PingRequest = { method: "ping"; params: Record<string, never> };

export type Request =
  | RenameSymbolRequest
  | FindSymbolRequest
  | FindReferencingSymbolsRequest
  | PingRequest;

// ===== レスポンス型 =====

export type RenameSymbolResult = {
  applied: boolean;
  filesChanged: ファイル編集[];
  totalEditCount: number;
  warnings: string[];
};

export type FindSymbolResult = {
  symbols: シンボル情報[];
};

export type FindReferencingSymbolsResult = {
  references: 参照情報[];
};

export type PingResult = {
  pong: true;
  extensionVersion: string;
  workspaceFolders: string[];
};

export type ResultMap = {
  renameSymbol: RenameSymbolResult;
  findSymbol: FindSymbolResult;
  findReferencingSymbols: FindReferencingSymbolsResult;
  ping: PingResult;
};

// ===== JSON-RPC 風エンベロープ =====

export type RpcRequest<R extends Request = Request> = {
  jsonrpc: "2.0";
  id: string;
  method: R["method"];
  params: R["params"];
};

export type RpcSuccess<M extends Request["method"]> = {
  jsonrpc: "2.0";
  id: string;
  result: ResultMap[M];
};

export type RpcError = {
  jsonrpc: "2.0";
  id: string;
  error: { code: number; message: string; data?: unknown };
};

export type RpcResponse = RpcSuccess<Request["method"]> | RpcError;

export const プロトコルバージョン = "0.1.0";
