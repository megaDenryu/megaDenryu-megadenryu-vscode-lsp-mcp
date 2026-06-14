import * as vscode from "vscode";
import { MCP設定を作る } from "./MCP設定";
import type { 固定ポート設定管理 } from "./固定ポート設定管理";
import type { 管理ビュー } from "./管理ビュー";
import type { サーバー管理 } from "./サーバー管理";
import type { サーバー状態 } from "./サーバー状態";

export type 拡張操作依存 = {
  context: vscode.ExtensionContext;
  サーバー: サーバー管理;
  固定ポート管理: 固定ポート設定管理;
  管理表示: 管理ビュー;
  出力: vscode.OutputChannel;
};

function 稼働していたか(状態: サーバー状態): boolean {
  return (
    状態.種別 === "稼働中" ||
    状態.種別 === "起動中" ||
    状態.種別 === "失敗"
  );
}

async function 自動起動を切り替える(): Promise<void> {
  const 設定 = vscode.workspace.getConfiguration("megadenryuLspMcp");
  const 現在値 = 設定.get<boolean>("autoStart", true);
  await 設定.update(
    "autoStart",
    !現在値,
    vscode.ConfigurationTarget.Workspace,
  );
}

async function 起動可能なら実行する(
  サーバー: サーバー管理,
  固定ポート管理: 固定ポート設定管理,
  再起動: boolean,
): Promise<void> {
  const 禁止理由 = 固定ポート管理.起動禁止理由を取得する();
  if (禁止理由 !== undefined) {
    サーバー.設定失敗を報告する(禁止理由);
    void vscode.window.showErrorMessage(禁止理由);
    return;
  }
  if (再起動) {
    await サーバー.再起動する();
  } else {
    await サーバー.起動する();
  }
}

async function ポート変更を実行する(
  サーバー: サーバー管理,
  固定ポート管理: 固定ポート設定管理,
): Promise<void> {
  const 現在ポート = 固定ポート管理.設定を取得する().ポート;
  const 入力 = await vscode.window.showInputBox({
    title: "LSP MCP 固定ポート",
    prompt: "このワークスペースで常に使用するポートを入力してください。",
    value: String(現在ポート),
    validateInput: (値) => {
      const 数値 = Number(値);
      return Number.isInteger(数値) && 数値 >= 1 && 数値 <= 65535
        ? undefined
        : "1 から 65535 の整数を入力してください。";
    },
  });
  if (入力 === undefined || Number(入力) === 現在ポート) {
    return;
  }

  const 変更前状態 = サーバー.状態を取得する();
  await サーバー.停止する();
  const 結果 = await 固定ポート管理.手動変更する(Number(入力));
  if (結果.種別 === "競合") {
    void vscode.window.showErrorMessage(結果.理由);
  } else {
    void vscode.window.showInformationMessage(
      `固定ポートを ${結果.ポート} に変更しました。MCP 設定側も同じ番号へ変更してください。`,
    );
  }
  if (稼働していたか(変更前状態)) {
    await 起動可能なら実行する(サーバー, 固定ポート管理, false);
  }
}

export function 拡張操作を登録する(依存: 拡張操作依存): void {
  const { context, サーバー, 固定ポート管理, 管理表示, 出力 } = 依存;
  context.subscriptions.push(
    vscode.commands.registerCommand("megadenryuLspMcp.showStatus", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.megadenryuLspMcp",
      );
      管理表示.更新する();
    }),
    vscode.commands.registerCommand("megadenryuLspMcp.startServer", () =>
      起動可能なら実行する(サーバー, 固定ポート管理, false),
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.stopServer", () =>
      サーバー.停止する(),
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.restartServer", () =>
      起動可能なら実行する(サーバー, 固定ポート管理, true),
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.setPort", async () => {
      await ポート変更を実行する(サーバー, 固定ポート管理);
      管理表示.更新する();
    }),
    vscode.commands.registerCommand(
      "megadenryuLspMcp.toggleAutoStart",
      自動起動を切り替える,
    ),
    vscode.commands.registerCommand(
      "megadenryuLspMcp.copyMcpConfiguration",
      async () => {
        const MCPサーバーパス = vscode.Uri.joinPath(
          context.extensionUri,
          "dist",
          "mcp.js",
        ).fsPath;
        const 設定 = MCP設定を作る(
          MCPサーバーパス,
          固定ポート管理.設定を取得する().ポート,
        );
        await vscode.env.clipboard.writeText(設定);
        void vscode.window.showInformationMessage(
          "このワークスペース用の MCP 設定をコピーしました。",
        );
      },
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.copyPort", async () => {
      const ポート = 固定ポート管理.設定を取得する().ポート;
      await vscode.env.clipboard.writeText(String(ポート));
      void vscode.window.showInformationMessage(
        `固定ポート ${ポート} をコピーしました。`,
      );
    }),
    vscode.commands.registerCommand("megadenryuLspMcp.showLog", () =>
      出力.show(true),
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.refresh", () =>
      管理表示.更新する(),
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("megadenryuLspMcp.port")) {
        if (固定ポート管理.保存設定が現在値か()) {
          管理表示.更新する();
          return;
        }
        const 変更前状態 = サーバー.状態を取得する();
        await サーバー.停止する();
        const 結果 = await 固定ポート管理.設定ファイル変更を反映する();
        if (結果.種別 === "競合") {
          void vscode.window.showErrorMessage(結果.理由);
        }
        if (稼働していたか(変更前状態)) {
          await 起動可能なら実行する(
            サーバー,
            固定ポート管理,
            false,
          );
        }
      }
      管理表示.更新する();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await サーバー.ワークスペース情報を更新する();
      管理表示.更新する();
    }),
  );
}
