import type { WebSocket } from "ws";
import type { RpcRequest, RpcResponse } from "../shared/protocol";

type リクエスト処理 = (req: RpcRequest) => Promise<RpcResponse>;

const 対応メソッド群 = new Set([
  "renameSymbol",
  "findSymbol",
  "findReferencingSymbols",
  "goToDefinition",
  "ping",
  "getDiagnostics",
  "listCommands",
  "executeCommand",
  "getWorkspaceStatus",
  "saveAllDirty",
  "getDocumentState",
  "renameFile",
]);

function RpcRequestか(value: unknown): value is RpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "jsonrpc" in value &&
    value.jsonrpc === "2.0" &&
    "id" in value &&
    typeof value.id === "string" &&
    "method" in value &&
    typeof value.method === "string" &&
    対応メソッド群.has(value.method) &&
    "params" in value &&
    typeof value.params === "object" &&
    value.params !== null
  );
}

export class WebSocket接続管理 {
  private readonly 接続群 = new Set<WebSocket>();

  constructor(
    private readonly リクエストを処理する: リクエスト処理,
    private readonly 接続数変更時: (接続数: number) => void,
    private readonly ログ: (message: string) => void,
  ) {}

  受け付ける(接続: WebSocket): void {
    this.接続群.add(接続);
    this.接続数変更時(this.接続群.size);
    接続.on("message", async (raw) => {
      try {
        const 生リクエスト: unknown = JSON.parse(raw.toString());
        if (!RpcRequestか(生リクエスト)) {
          throw new Error("JSON-RPC リクエスト形式が不正です。");
        }
        const 応答 = await this.リクエストを処理する(生リクエスト);
        接続.send(JSON.stringify(応答));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        接続.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "",
            error: { code: -32700, message },
          }),
        );
      }
    });
    接続.on("close", () => {
      this.接続群.delete(接続);
      this.接続数変更時(this.接続群.size);
    });
    接続.on("error", (error) => {
      this.ログ(`WebSocket エラー: ${error.message}`);
    });
  }

  全て切断する(): void {
    for (const 接続 of this.接続群) {
      接続.terminate();
    }
    this.接続群.clear();
    this.接続数変更時(0);
  }
}
