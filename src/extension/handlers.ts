// VSCode API を呼んで MCP プロトコルの各リクエストに対する結果を返すハンドラ群。
// rename_symbol は P1.1 (位置補正) + P1.2 (#[path] 同期) + P2.4 (失敗種別) を含む
// オーケストレータとして実装。副作用は VSCode API 呼び出しと workspace.applyEdit のみ。

import * as vscode from "vscode";
import type {
  FindReferencingSymbolsRequest,
  FindReferencingSymbolsResult,
  FindSymbolRequest,
  FindSymbolResult,
  GoToDefinitionRequest,
  GoToDefinitionResult,
  PingResult,
  RenameSymbolRequest,
  RenameSymbolResult,
  RenameFailureKind,
  ファイル編集,
  シンボル情報,
  参照情報,
  位置補正情報,
} from "../shared/protocol";
import { 位置を識別子境界に補正する } from "./識別子境界";
import {
  mod宣言renameを検出する,
  path属性編集を計算する,
  type 追加テキスト編集,
} from "./path属性同期";
import { 拡張バージョン } from "../shared/version";

function ファイルパスからURI化(filePath: string): vscode.Uri {
  return vscode.Uri.file(filePath);
}

function SymbolKind名(kind: vscode.SymbolKind): string {
  return vscode.SymbolKind[kind] ?? `unknown(${kind})`;
}

export async function pingを処理(): Promise<PingResult> {
  const フォルダ群 = (vscode.workspace.workspaceFolders ?? []).map(
    (f) => f.uri.fsPath,
  );
  return {
    pong: true,
    extensionVersion: 拡張バージョン,
    workspaceFolders: フォルダ群,
  };
}

// rename 失敗時の共通生成 (失敗種別 + warnings を詰めて applied=false で返す)
function 失敗結果(
  failureKind: RenameFailureKind,
  message: string,
  positionAdjusted: 位置補正情報 | null = null,
): RenameSymbolResult {
  return {
    applied: false,
    filesChanged: [],
    totalEditCount: 0,
    warnings: [message],
    positionAdjusted,
    pathAttributeUpdatesAdded: 0,
    failureKind,
  };
}

export async function rename_symbolを処理(
  params: RenameSymbolRequest["params"],
): Promise<RenameSymbolResult> {
  const uri = ファイルパスからURI化(params.file);
  const 与えられた位置 = new vscode.Position(params.line, params.character);

  // P1.1: 位置補正
  const 補正 = await 位置を識別子境界に補正する(uri, 与えられた位置);
  if (補正.種別 === "失敗") {
    return 失敗結果("positionNotOnIdentifier", 補正.理由);
  }
  const position = 補正.位置;
  const positionAdjusted = 補正.補正情報;

  // rename 編集取得
  let workspaceEdit: vscode.WorkspaceEdit | undefined;
  try {
    workspaceEdit = await vscode.commands.executeCommand<
      vscode.WorkspaceEdit | undefined
    >("vscode.executeDocumentRenameProvider", uri, position, params.newName);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return 失敗結果(
      "providerError",
      `rename provider が例外を投げました: ${message}`,
      positionAdjusted,
    );
  }

  if (!workspaceEdit) {
    return 失敗結果(
      "providerReturnedNoEdits",
      "rename provider が undefined を返しました (LSP 未起動 / シンボルが rename 不可)。",
      positionAdjusted,
    );
  }

  // P1.2: #[path] 属性同期。WorkspaceEdit に追加 TextEdit を注入する。
  const pathAttributeUpdatesAdded =
    await workspaceEditにpath属性追加編集を注入する(workspaceEdit, params.newName);

  // 集計
  const filesChanged: ファイル編集[] = [];
  let totalEditCount = 0;
  for (const [u, edits] of workspaceEdit.entries()) {
    filesChanged.push({
      file: u.fsPath,
      edits: edits.map((e) => ({
        range: {
          start: { line: e.range.start.line, character: e.range.start.character },
          end: { line: e.range.end.line, character: e.range.end.character },
        },
        newText: e.newText,
      })),
    });
    totalEditCount += edits.length;
  }

  const warnings: string[] = [];
  if (totalEditCount === 0) {
    return 失敗結果(
      "providerReturnedNoEdits",
      "WorkspaceEdit は返ってきましたが編集件数が 0 でした (rename 対象が解決されなかった可能性)。",
      positionAdjusted,
    );
  }

  let applied = false;
  if (params.apply) {
    applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
      return {
        applied: false,
        filesChanged,
        totalEditCount,
        warnings: ["workspace.applyEdit が false を返しました (適用失敗)。"],
        positionAdjusted,
        pathAttributeUpdatesAdded,
        failureKind: "applyEditFailed",
      };
    }
    // ディスクへの保存。未保存だと cargo check 等が古い内容で走ってしまう。
    const 対象URI群 = filesChanged.map((f) => ファイルパスからURI化(f.file));
    const 保存対象 = vscode.workspace.textDocuments.filter((doc) =>
      対象URI群.some((u) => u.fsPath === doc.uri.fsPath),
    );
    for (const doc of 保存対象) {
      if (doc.isDirty) {
        await doc.save();
      }
    }
  }

  return {
    applied,
    filesChanged,
    totalEditCount,
    warnings,
    positionAdjusted,
    pathAttributeUpdatesAdded,
    failureKind: null,
  };
}

// WorkspaceEdit を走査し、mod 宣言 rename を検知したファイルごとに
// `#[path = "..."]` 属性を新名で書き換える TextEdit を追加で注入する。
// 戻り値は追加した編集の総数。
async function workspaceEditにpath属性追加編集を注入する(
  workspaceEdit: vscode.WorkspaceEdit,
  newName: string,
): Promise<number> {
  let 追加件数 = 0;

  for (const [u, edits] of workspaceEdit.entries()) {
    // Rust ファイル以外は path 属性同期の対象外
    if (!u.fsPath.endsWith(".rs")) continue;

    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(u);
    } catch {
      continue;
    }
    const 全文行: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      全文行.push(document.lineAt(i).text);
    }

    const 追加編集群: 追加テキスト編集[] = [];
    for (const edit of edits) {
      const 対象行テキスト = 全文行[edit.range.start.line];
      if (対象行テキスト === undefined) continue;

      const rename = mod宣言renameを検出する(
        対象行テキスト,
        {
          start: { line: edit.range.start.line, character: edit.range.start.character },
          end: { line: edit.range.end.line, character: edit.range.end.character },
        },
        edit.newText,
      );
      if (rename === null) continue;
      // mod 宣言の rename だが、newName は WorkspaceEdit から確定するので
      // params.newName は念のため整合確認 (通常一致するはず)
      if (rename.newName !== newName) continue;

      const path編集 = path属性編集を計算する(
        全文行,
        edit.range.start.line,
        rename,
      );
      if (path編集 === null) continue;
      追加編集群.push(path編集);
    }

    for (const e of 追加編集群) {
      workspaceEdit.replace(
        u,
        new vscode.Range(
          new vscode.Position(e.range.start.line, e.range.start.character),
          new vscode.Position(e.range.end.line, e.range.end.character),
        ),
        e.newText,
      );
      追加件数 += 1;
    }
  }

  return 追加件数;
}

export async function find_symbolを処理(
  params: FindSymbolRequest["params"],
): Promise<FindSymbolResult> {
  const limit = params.limit ?? 50;
  const シンボル群 = await vscode.commands.executeCommand<
    vscode.SymbolInformation[] | undefined
  >("vscode.executeWorkspaceSymbolProvider", params.query);

  const 結果: シンボル情報[] = [];
  for (const s of シンボル群 ?? []) {
    if (結果.length >= limit) break;
    結果.push({
      name: s.name,
      kind: SymbolKind名(s.kind),
      file: s.location.uri.fsPath,
      line: s.location.range.start.line,
      character: s.location.range.start.character,
      ...(s.containerName ? { containerName: s.containerName } : {}),
    });
  }
  return { symbols: 結果 };
}

export async function goToDefinitionを処理(
  params: GoToDefinitionRequest["params"],
): Promise<GoToDefinitionResult> {
  const uri = ファイルパスからURI化(params.file);
  const position = new vscode.Position(params.line, params.character);

  const ロケーション群 = await vscode.commands.executeCommand<
    vscode.Location[] | vscode.LocationLink[] | undefined
  >("vscode.executeDefinitionProvider", uri, position);

  const 定義群: 参照情報[] = [];
  for (const loc of ロケーション群 ?? []) {
    if ("targetUri" in loc) {
      定義群.push({
        file: loc.targetUri.fsPath,
        line: loc.targetRange.start.line,
        character: loc.targetRange.start.character,
        endLine: loc.targetRange.end.line,
        endCharacter: loc.targetRange.end.character,
      });
    } else {
      定義群.push({
        file: loc.uri.fsPath,
        line: loc.range.start.line,
        character: loc.range.start.character,
        endLine: loc.range.end.line,
        endCharacter: loc.range.end.character,
      });
    }
  }

  const 最初の定義 = 定義群[0];
  if (params.openFile && 最初の定義 !== undefined) {
    const 定義uri = vscode.Uri.file(最初の定義.file);
    await vscode.commands.executeCommand("vscode.open", 定義uri);
  }

  return { definitions: 定義群 };
}

export async function find_referencing_symbolsを処理(
  params: FindReferencingSymbolsRequest["params"],
): Promise<FindReferencingSymbolsResult> {
  const uri = ファイルパスからURI化(params.file);
  const position = new vscode.Position(params.line, params.character);

  const ロケーション群 = await vscode.commands.executeCommand<
    vscode.Location[] | undefined
  >("vscode.executeReferenceProvider", uri, position);

  const 参照: 参照情報[] = [];
  for (const loc of ロケーション群 ?? []) {
    参照.push({
      file: loc.uri.fsPath,
      line: loc.range.start.line,
      character: loc.range.start.character,
      endLine: loc.range.end.line,
      endCharacter: loc.range.end.character,
    });
  }
  return { references: 参照 };
}
