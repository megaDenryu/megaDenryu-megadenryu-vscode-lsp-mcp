import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import type { 拡張クライアント } from "./client";
import {
  executeCommandSchema,
  findReferencingSymbolsSchema,
  findSymbolSchema,
  getDiagnosticsSchema,
  getDocumentStateSchema,
  listCommandsSchema,
  renameFileSchema,
  renameSymbolSchema,
  saveAllDirtySchema,
} from "./ツール定義";

function 結果を返す(result: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

export async function ツールを呼び出す(
  client: 拡張クライアント,
  req: CallToolRequest,
) {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  try {
    switch (name) {
      case "ping":
        return 結果を返す(await client.呼び出し("ping", {}));
      case "rename_symbol":
        return 結果を返す(
          await client.呼び出し("renameSymbol", renameSymbolSchema.parse(args)),
        );
      case "find_symbol":
        return 結果を返す(
          await client.呼び出し("findSymbol", findSymbolSchema.parse(args)),
        );
      case "find_referencing_symbols":
        return 結果を返す(
          await client.呼び出し(
            "findReferencingSymbols",
            findReferencingSymbolsSchema.parse(args),
          ),
        );
      case "get_diagnostics":
        return 結果を返す(
          await client.呼び出し(
            "getDiagnostics",
            getDiagnosticsSchema.parse(args),
          ),
        );
      case "list_commands":
        return 結果を返す(
          await client.呼び出し("listCommands", listCommandsSchema.parse(args)),
        );
      case "execute_command":
        return 結果を返す(
          await client.呼び出し(
            "executeCommand",
            executeCommandSchema.parse(args),
          ),
        );
      case "get_workspace_status":
        return 結果を返す(await client.呼び出し("getWorkspaceStatus", {}));
      case "save_all_dirty":
        return 結果を返す(
          await client.呼び出し("saveAllDirty", saveAllDirtySchema.parse(args)),
        );
      case "get_document_state":
        return 結果を返す(
          await client.呼び出し(
            "getDocumentState",
            getDocumentStateSchema.parse(args),
          ),
        );
      case "rename_file":
        return 結果を返す(
          await client.呼び出し("renameFile", renameFileSchema.parse(args)),
        );
      default:
        return {
          isError: true,
          content: [{ type: "text" as const, text: `未知のツール: ${name}` }],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}
