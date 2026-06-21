import type { サーバー状態 } from "./サーバー状態";

// 起動 / 停止ボタンをトグル表示するための判定。稼働中・起動中は停止操作を提示し、
// 停止中・停止処理中・失敗は起動操作を提示する。TreeView の操作項目と view/title の
// ボタン表示が同じ基準で切り替わるよう、判定を 1 箇所に集約する。
export function 停止操作を提示すべきか(状態: サーバー状態): boolean {
  switch (状態.種別) {
    case "稼働中":
    case "起動中":
      return true;
    case "停止中":
    case "停止処理中":
    case "失敗":
      return false;
  }
}
