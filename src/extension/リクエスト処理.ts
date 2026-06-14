import type { RpcRequest, RpcResponse } from "../shared/protocol";
import {
  find_referencing_symbolsを処理,
  find_symbolを処理,
  pingを処理,
  rename_symbolを処理,
} from "./handlers";
import {
  executeCommandを処理,
  getDiagnosticsを処理,
  getDocumentStateを処理,
  getWorkspaceStatusを処理,
  listCommandsを処理,
  saveAllDirtyを処理,
} from "./診断と状態";
import { renameFileを処理 } from "./ファイルrename";

export type ログ出力 = (message: string) => void;

export function リクエスト処理を作る(ログ: ログ出力) {
  return async (req: RpcRequest): Promise<RpcResponse> => {
    try {
      switch (req.method) {
        case "ping":
          return { jsonrpc: "2.0", id: req.id, result: await pingを処理() };
        case "renameSymbol":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await rename_symbolを処理(req.params),
          };
        case "findSymbol":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await find_symbolを処理(req.params),
          };
        case "findReferencingSymbols":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await find_referencing_symbolsを処理(req.params),
          };
        case "getDiagnostics":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await getDiagnosticsを処理(req.params),
          };
        case "listCommands":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await listCommandsを処理(req.params),
          };
        case "executeCommand":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await executeCommandを処理(req.params),
          };
        case "getWorkspaceStatus":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await getWorkspaceStatusを処理(),
          };
        case "saveAllDirty":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await saveAllDirtyを処理(req.params),
          };
        case "getDocumentState":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await getDocumentStateを処理(req.params),
          };
        case "renameFile":
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await renameFileを処理(req.params),
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ログ(`リクエスト処理失敗: ${req.method} (${req.id}) -> ${message}`);
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message, data: { method: req.method } },
      };
    }
  };
}
