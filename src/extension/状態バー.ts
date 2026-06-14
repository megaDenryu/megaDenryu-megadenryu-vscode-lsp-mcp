import * as vscode from "vscode";
import type { サーバー管理 } from "./サーバー管理";
import type { サーバー状態 } from "./サーバー状態";

function 表示を作る(状態: サーバー状態): {
  text: string;
  tooltip: string;
  backgroundColor?: vscode.ThemeColor;
} {
  switch (状態.種別) {
    case "停止中":
      return { text: "$(circle-slash) LSP MCP: 停止", tooltip: "停止中" };
    case "起動中":
      return { text: "$(loading~spin) LSP MCP", tooltip: "起動中" };
    case "停止処理中":
      return { text: "$(loading~spin) LSP MCP", tooltip: "停止処理中" };
    case "失敗":
      return {
        text: "$(error) LSP MCP",
        tooltip: 状態.理由,
        backgroundColor: new vscode.ThemeColor(
          "statusBarItem.errorBackground",
        ),
      };
    case "稼働中":
      return {
        text: `$(radio-tower) LSP MCP: ${状態.実ポート}`,
        tooltip: `稼働中\n接続数: ${状態.接続数}\nポート: ${状態.実ポート}`,
      };
  }
}

export function 状態バーを作る(
  サーバー: サーバー管理,
): vscode.Disposable {
  const 状態バー = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );
  状態バー.name = "megaDenryu LSP MCP";
  状態バー.command = "megadenryuLspMcp.showStatus";

  const 更新する = (状態: サーバー状態) => {
    const 表示 = 表示を作る(状態);
    状態バー.text = 表示.text;
    状態バー.tooltip = 表示.tooltip;
    状態バー.backgroundColor = 表示.backgroundColor;
    状態バー.show();
  };
  更新する(サーバー.状態を取得する());
  const 購読 = サーバー.状態変更を購読する(更新する);
  return {
    dispose: () => {
      購読.dispose();
      状態バー.dispose();
    },
  };
}
