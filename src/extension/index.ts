import * as vscode from "vscode";
import { 固定ポート割当 } from "../shared/固定ポート割当";
import {
  インスタンス登録簿,
  type ワークスペース情報,
} from "../shared/インスタンス登録簿";
import { 固定ポート設定管理 } from "./固定ポート設定管理";
import { 拡張操作を登録する } from "./拡張操作";
import { 管理ビュー } from "./管理ビュー";
import { ポートが使用中か } from "./ポート使用検査";
import { サーバー管理 } from "./サーバー管理";
import type { 拡張設定 } from "./サーバー状態";
import { 操作ボタン文脈を作る } from "./操作ボタン文脈";
import { 状態バーを作る } from "./状態バー";
import { リクエスト処理を作る } from "./リクエスト処理";

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

function 自動起動設定を取得する(): boolean {
  return vscode.workspace
    .getConfiguration("megadenryuLspMcp")
    .get<boolean>("autoStart", true);
}

function 保存ポートを取得する(): number | null | undefined {
  return vscode.workspace
    .getConfiguration("megadenryuLspMcp")
    .get<number | null>("port");
}

async function ポートを保存する(ポート: number): Promise<void> {
  await vscode.workspace
    .getConfiguration("megadenryuLspMcp")
    .update("port", ポート, vscode.ConfigurationTarget.Workspace);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const 出力 = vscode.window.createOutputChannel("megaDenryu LSP MCP");
  const ログ = (message: string) =>
    出力.appendLine(`[${new Date().toISOString()}] ${message}`);
  const 登録簿 = new インスタンス登録簿();
  const 固定ポート管理 = new 固定ポート設定管理(
    new 固定ポート割当(undefined, ポートが使用中か),
    ワークスペース情報を取得する,
    保存ポートを取得する,
    ポートを保存する,
  );
  const 初期化結果 = await 固定ポート管理.初期化する();
  const 設定取得 = (): 拡張設定 => ({
    ポート設定: 固定ポート管理.設定を取得する(),
    自動起動: 自動起動設定を取得する(),
  });
  const サーバー = new サーバー管理(
    設定取得,
    ワークスペース情報を取得する,
    リクエスト処理を作る(ログ),
    ログ,
    登録簿,
  );
  const 管理表示 = new 管理ビュー(
    サーバー,
    設定取得,
    () => ワークスペース情報を取得する().ワークスペース名,
    登録簿,
  );
  const ツリー = vscode.window.createTreeView("megadenryuLspMcp.control", {
    treeDataProvider: 管理表示,
  });
  const 状態バー = 状態バーを作る(サーバー);
  const 操作ボタン文脈 = 操作ボタン文脈を作る(サーバー);

  context.subscriptions.push(出力, 管理表示, ツリー, 状態バー, 操作ボタン文脈);
  拡張操作を登録する({
    context,
    サーバー,
    固定ポート管理,
    管理表示,
    出力,
  });
  context.subscriptions.push({
    dispose: () => {
      void サーバー.dispose();
    },
  });

  ログ("activate");
  if (初期化結果.種別 === "競合") {
    サーバー.設定失敗を報告する(初期化結果.理由);
    void vscode.window.showErrorMessage(初期化結果.理由);
    return;
  }
  if (設定取得().自動起動) {
    await サーバー.起動する();
  }
}

export async function deactivate(): Promise<void> {
  // ExtensionContext の subscriptions がサーバー管理を停止する。
}
