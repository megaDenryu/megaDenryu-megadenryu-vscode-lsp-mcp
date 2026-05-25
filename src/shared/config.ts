// 拡張と MCP server で共有する起動設定。
// MCP server 側は環境変数 MEGADENRYU_LSP_MCP_PORT で上書き可能。

export const 既定ポート = 17800;

export function ポート解決(envValue: string | undefined): number {
  if (envValue === undefined || envValue === "") {
    return 既定ポート;
  }
  const n = Number.parseInt(envValue, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) {
    throw new Error(`MEGADENRYU_LSP_MCP_PORT が不正です: ${envValue}`);
  }
  return n;
}

export const ホスト = "127.0.0.1";
