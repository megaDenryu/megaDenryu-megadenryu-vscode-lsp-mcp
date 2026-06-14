import type { 稼働インスタンス情報 } from "../shared/インスタンス登録簿";

type 登録簿読み取り = {
  一覧を取得する(): Promise<稼働インスタンス情報[]>;
};

export async function 起動失敗理由を作る(
  エラー: unknown,
  ポート: number,
  登録簿: 登録簿読み取り,
  ログ: (message: string) => void,
): Promise<string> {
  if (
    エラー instanceof Error &&
    "code" in エラー &&
    エラー.code === "EADDRINUSE"
  ) {
    let 使用中ワークスペース名: string | undefined;
    try {
      使用中ワークスペース名 = (
        await 登録簿.一覧を取得する()
      ).find((情報) => 情報.ポート === ポート)?.ワークスペース名;
    } catch (登録簿エラー) {
      const 詳細 =
        登録簿エラー instanceof Error
          ? 登録簿エラー.message
          : String(登録簿エラー);
      ログ(`競合元の確認失敗: ${詳細}`);
    }
    return 使用中ワークスペース名 === undefined
      ? `固定ポート ${ポート} は別のアプリケーションが使用中です。ポート設定は変更していません。`
      : `固定ポート ${ポート} は VS Code ワークスペース「${使用中ワークスペース名}」が使用中です。`;
  }
  return エラー instanceof Error ? エラー.message : String(エラー);
}
