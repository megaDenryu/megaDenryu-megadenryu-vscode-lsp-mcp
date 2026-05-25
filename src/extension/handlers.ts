// VSCode API を呼んで MCP プロトコルの各リクエストに対する結果を返すハンドラ群。
// rename_symbol は WorkspaceEdit を取得し、必要なら applyEdit まで実施する。

import * as vscode from "vscode";
import type {
  FindReferencingSymbolsRequest,
  FindReferencingSymbolsResult,
  FindSymbolRequest,
  FindSymbolResult,
  PingResult,
  RenameSymbolRequest,
  RenameSymbolResult,
  ファイル編集,
  シンボル情報,
  参照情報,
} from "../shared/protocol";

const 拡張バージョン = "0.1.0";

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

export async function rename_symbolを処理(
  params: RenameSymbolRequest["params"],
): Promise<RenameSymbolResult> {
  const uri = ファイルパスからURI化(params.file);
  const position = new vscode.Position(params.line, params.character);

  // VSCode の rename は内部で対応する LSP (rust-analyzer / tsserver 等) に
  // textDocument/rename を投げ WorkspaceEdit を返す。VSCode の rename UI と同等。
  const workspaceEdit = await vscode.commands.executeCommand<
    vscode.WorkspaceEdit | undefined
  >(
    "vscode.executeDocumentRenameProvider",
    uri,
    position,
    params.newName,
  );

  const warnings: string[] = [];
  if (!workspaceEdit) {
    return {
      applied: false,
      filesChanged: [],
      totalEditCount: 0,
      warnings: [
        "rename provider が編集を返しませんでした。対象シンボルがリネーム不可、または LSP が未起動の可能性があります。",
      ],
    };
  }

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

  if (totalEditCount === 0) {
    warnings.push("WorkspaceEdit は返ってきましたが編集件数が 0 でした。");
  }

  let applied = false;
  if (params.apply) {
    applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
      warnings.push("workspace.applyEdit が false を返しました (適用失敗)。");
    } else {
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
  }

  return { applied, filesChanged, totalEditCount, warnings };
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
