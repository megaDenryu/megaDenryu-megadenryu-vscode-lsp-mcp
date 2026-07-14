export async function 接続URLを解決する(明示ポート) {
  const 設定値 =
    明示ポート ?? process.env.MEGADENRYU_LSP_MCP_PORT;
  if (設定値 === undefined || String(設定値).trim() === "") {
    throw new Error(
      "固定ポートが未指定です。引数または MEGADENRYU_LSP_MCP_PORT を指定してください。",
    );
  }
  const ポート = Number(設定値);
  if (!Number.isInteger(ポート) || ポート < 1 || ポート > 65535) {
    throw new Error(`ポートが不正です: ${設定値}`);
  }
  return `ws://127.0.0.1:${ポート}`;
}
