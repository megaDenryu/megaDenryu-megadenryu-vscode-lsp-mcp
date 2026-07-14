export const ホスト = "127.0.0.1";

export type ポート設定 = { 種別: "固定"; ポート: number };

export function ポート設定を解釈する(設定値: number): ポート設定 {
  if (!Number.isInteger(設定値) || 設定値 < 1 || 設定値 > 65535) {
    throw new Error(`ポート設定が不正です: ${設定値}`);
  }
  return { 種別: "固定", ポート: 設定値 };
}

export function 保存済みポートを解釈する(
  設定値: number | null | undefined,
): number | undefined {
  if (設定値 === null || 設定値 === undefined) {
    return undefined;
  }
  return ポート設定を解釈する(設定値).ポート;
}

export function 環境変数ポートを解釈する(
  環境変数値: string | undefined,
): number | undefined {
  if (環境変数値 === undefined || 環境変数値.trim() === "") {
    return undefined;
  }
  const ポート = Number(環境変数値);
  if (!Number.isInteger(ポート) || ポート < 1 || ポート > 65535) {
    throw new Error(
      `MEGADENRYU_LSP_MCP_PORT が不正です: ${環境変数値}`,
    );
  }
  return ポート;
}

export function 待受ポートを取得する(設定: ポート設定): number {
  return 設定.ポート;
}

export function ポート設定を表示する(設定: ポート設定): string {
  return `固定 ${設定.ポート}`;
}
