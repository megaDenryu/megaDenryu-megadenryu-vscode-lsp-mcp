import * as vscode from "vscode";
import { 停止操作を提示すべきか } from "./操作トグル状態";
import type { サーバー管理 } from "./サーバー管理";
import type { サーバー状態 } from "./サーバー状態";

// view/title の起動 / 停止ボタンを排他表示するためのコンテキストキー。
// when 句から参照されるため VS Code 側の識別子規約に合わせ ASCII にする。
const 停止操作可能キー = "megadenryuLspMcp.canStopServer";

// view/title の起動 / 停止ボタンをサーバー状態に追従させてトグル表示する。
// 停止操作可能=true のとき停止ボタン、false のとき起動ボタンを表示する。
export function 操作ボタン文脈を作る(サーバー: サーバー管理): vscode.Disposable {
  const 反映する = (状態: サーバー状態) => {
    void vscode.commands.executeCommand(
      "setContext",
      停止操作可能キー,
      停止操作を提示すべきか(状態),
    );
  };
  反映する(サーバー.状態を取得する());
  const 購読 = サーバー.状態変更を購読する(反映する);
  return {
    dispose: () => 購読.dispose(),
  };
}
