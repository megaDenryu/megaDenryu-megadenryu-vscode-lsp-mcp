import * as vscode from "vscode";
import { ポート設定を解釈する } from "../shared/config";
import {
  インスタンス登録簿,
  type ワークスペース情報,
} from "../shared/インスタンス登録簿";
import { 管理ビュー } from "./管理ビュー";
import {
  サーバー管理,
} from "./サーバー管理";
import type { 拡張設定, サーバー状態 } from "./サーバー状態";
import { 状態バーを作る } from "./状態バー";
import { リクエスト処理を作る } from "./リクエスト処理";

function 設定を取得する(): 拡張設定 {
  const 設定 = vscode.workspace.getConfiguration("megadenryuLspMcp");
  return {
    ポート設定: ポート設定を解釈する(設定.get<number>("port", 0)),
    自動起動: 設定.get<boolean>("autoStart", true),
  };
}

function ワークスペース情報を取得する(): ワークスペース情報 {
  const フォルダ群 = vscode.workspace.workspaceFolders ?? [];
  return {
    ワークスペース名:
      vscode.workspace.name ?? フォルダ群[0]?.name ?? "ワークスペースなし",
    ワークスペースファイル: vscode.workspace.workspaceFile?.fsPath ?? null,
    ワークスペースフォルダ群: フォルダ群.map(
      (フォルダ) => フォルダ.uri.fsPath,
    ),
  };
}

function 稼働していたか(状態: サーバー状態): boolean {
  return (
    状態.種別 === "稼働中" ||
    状態.種別 === "起動中" ||
    状態.種別 === "失敗"
  );
}

async function ポートを設定する(): Promise<void> {
  const 現在値 = vscode.workspace
    .getConfiguration("megadenryuLspMcp")
    .get<number>("port", 0);
  const 入力 = await vscode.window.showInputBox({
    title: "LSP MCP ポート設定",
    prompt: "0 は自動割り当て、1 から 65535 は固定ポートです。",
    value: String(現在値),
    validateInput: (値) => {
      const 数値 = Number(値);
      return Number.isInteger(数値) && 数値 >= 0 && 数値 <= 65535
        ? undefined
        : "0 から 65535 の整数を入力してください。";
    },
  });
  if (入力 === undefined) {
    return;
  }
  await vscode.workspace
    .getConfiguration("megadenryuLspMcp")
    .update("port", Number(入力), vscode.ConfigurationTarget.Workspace);
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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const 出力 = vscode.window.createOutputChannel("megaDenryu LSP MCP");
  const ログ = (message: string) =>
    出力.appendLine(`[${new Date().toISOString()}] ${message}`);
  const 登録簿 = new インスタンス登録簿();
  const サーバー = new サーバー管理(
    設定を取得する,
    ワークスペース情報を取得する,
    リクエスト処理を作る(ログ),
    ログ,
    登録簿,
  );
  const 管理表示 = new 管理ビュー(
    サーバー,
    設定を取得する,
    () => ワークスペース情報を取得する().ワークスペース名,
    登録簿,
  );
  const ツリー = vscode.window.createTreeView(
    "megadenryuLspMcp.control",
    { treeDataProvider: 管理表示 },
  );
  const 状態バー = 状態バーを作る(サーバー);

  context.subscriptions.push(出力, 管理表示, ツリー, 状態バー);
  context.subscriptions.push(
    vscode.commands.registerCommand("megadenryuLspMcp.showStatus", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.megadenryuLspMcp",
      );
      管理表示.更新する();
    }),
    vscode.commands.registerCommand("megadenryuLspMcp.startServer", () =>
      サーバー.起動する(),
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.stopServer", () =>
      サーバー.停止する(),
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.restartServer", () =>
      サーバー.再起動する(),
    ),
    vscode.commands.registerCommand(
      "megadenryuLspMcp.setPort",
      ポートを設定する,
    ),
    vscode.commands.registerCommand(
      "megadenryuLspMcp.toggleAutoStart",
      自動起動を切り替える,
    ),
    vscode.commands.registerCommand(
      "megadenryuLspMcp.copyWorkspaceSelector",
      async () => {
        const 情報 = ワークスペース情報を取得する();
        const 対象 =
          情報.ワークスペースファイル ??
          情報.ワークスペースフォルダ群[0];
        if (対象 === undefined) {
          void vscode.window.showErrorMessage(
            "コピーできるワークスペースがありません。",
          );
          return;
        }
        const 設定断片 = JSON.stringify(
          { MEGADENRYU_LSP_MCP_WORKSPACE: 対象 },
          null,
          2,
        );
        await vscode.env.clipboard.writeText(設定断片);
        void vscode.window.showInformationMessage(
          "MCP のワークスペース指定をコピーしました。",
        );
      },
    ),
    vscode.commands.registerCommand("megadenryuLspMcp.copyPort", async () => {
      const 状態 = サーバー.状態を取得する();
      if (状態.種別 !== "稼働中") {
        void vscode.window.showErrorMessage(
          "サーバーが稼働していないため実ポートをコピーできません。",
        );
        return;
      }
      await vscode.env.clipboard.writeText(String(状態.実ポート));
      void vscode.window.showInformationMessage(
        `実ポート ${状態.実ポート} をコピーしました。`,
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
        const 変更前状態 = サーバー.状態を取得する();
        if (稼働していたか(変更前状態)) {
          await サーバー.再起動する();
        }
      }
      管理表示.更新する();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await サーバー.ワークスペース情報を更新する();
      管理表示.更新する();
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      void サーバー.dispose();
    },
  });
  ログ("activate");
  if (設定を取得する().自動起動) {
    await サーバー.起動する();
  }
}

export async function deactivate(): Promise<void> {
  // ExtensionContext の subscriptions がサーバー管理を停止する。
}
