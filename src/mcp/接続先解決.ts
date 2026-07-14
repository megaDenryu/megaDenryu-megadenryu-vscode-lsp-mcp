import { 環境変数ポートを解釈する } from "../shared/config";

export type MCP接続先 = { 種別: "明示ポート"; ポート: number };

type 接続先環境変数 = {
  MEGADENRYU_LSP_MCP_PORT?: string;
};

export class 接続先解決エラー extends Error {
  constructor(message: string) {
    super(message);
    this.name = "接続先解決エラー";
  }
}

export function MCP接続先を解決する(
  環境変数: 接続先環境変数,
): MCP接続先 {
  const 明示ポート = 環境変数ポートを解釈する(
    環境変数.MEGADENRYU_LSP_MCP_PORT,
  );
  if (明示ポート === undefined) {
    throw new 接続先解決エラー(
      "MEGADENRYU_LSP_MCP_PORT が未指定です。VS Code の LSP MCP 管理画面に表示される固定ポートを、このワークスペースの .mcp.json に設定してください。",
    );
  }
  return { 種別: "明示ポート", ポート: 明示ポート };
}

export function MCP接続先を表示する(接続先: MCP接続先): string {
  return `固定ポート ${接続先.ポート}`;
}
