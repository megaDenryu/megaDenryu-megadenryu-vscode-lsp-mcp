// セッション 7: ファイル rename ハンドラ。
//
// 設計の肝: WorkspaceEdit.renameFile + applyEdit 経由でリネームすると、
// VSCode が LSP の workspace/willRenameFiles を発火 → rust-analyzer 等が
// participate して mod 宣言 / use 文 / import パスの更新 TextEdit を
// 同じ WorkspaceEdit に追加注入する仕様 (LSP 3.16+)。
//
// つまり「mod X; の X を rename したい」シナリオを、ファイル X.rs → Y.rs
// のリネームで間接的に解決できる。executeDocumentRenameProvider 経由で
// rust-analyzer が空応答を返す mod 識別子 rename の代替経路。
//
// 加えて #[path = "X.rs"] 属性は LSP 標準仕様の対象外なので、本拡張側で
// path属性同期.ts の純粋ロジックを再利用して追加 TextEdit を注入する。

import * as vscode from "vscode";
import * as path from "node:path";
import type {
  RenameFileRequest,
  RenameFileResult,
} from "../shared/protocol";
import { path属性編集を計算する } from "./path属性同期";

export async function renameFileを処理(
  params: RenameFileRequest["params"],
): Promise<RenameFileResult> {
  const oldUri = vscode.Uri.file(params.oldPath);
  const newUri = vscode.Uri.file(params.newPath);
  const warnings: string[] = [];

  // 事前 dirty スナップショット (LSP participation の観測用)
  const 事前dirty = new Set(
    vscode.workspace.textDocuments.filter((d) => d.isDirty).map((d) => d.uri.fsPath),
  );

  // 事前存在確認
  const old存在 = await ファイル存在確認(oldUri);
  if (!old存在) {
    return {
      applied: false,
      observedSideEffects: {
        dirtyAfter: [],
        fileExistsNow: { oldPath: false, newPath: await ファイル存在確認(newUri) },
      },
      pathAttributeUpdatesAdded: 0,
      warnings: [`元ファイルが存在しません: ${params.oldPath}`],
    };
  }
  const new既存 = await ファイル存在確認(newUri);
  if (new既存 && !params.overwrite) {
    return {
      applied: false,
      observedSideEffects: {
        dirtyAfter: [],
        fileExistsNow: { oldPath: true, newPath: true },
      },
      pathAttributeUpdatesAdded: 0,
      warnings: [
        `新ファイルが既に存在します: ${params.newPath} (overwrite=true 指定で上書き可)`,
      ],
    };
  }

  // P1.2 同等: 同じ workspace edit に #[path] 属性同期も含める。
  // ファイル rename + path 属性書き換えを atomic に適用したい。
  let pathAttributeUpdatesAdded = 0;
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(oldUri, newUri, { overwrite: params.overwrite ?? false });

  if (params.syncPathAttribute ?? true) {
    const oldBasename = path.basename(params.oldPath, path.extname(params.oldPath));
    const newBasename = path.basename(params.newPath, path.extname(params.newPath));
    pathAttributeUpdatesAdded = await path属性追加編集を全workspaceに注入する(
      edit,
      oldBasename,
      newBasename,
    );
  }

  let applied = false;
  try {
    applied = await vscode.workspace.applyEdit(edit);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    warnings.push(`applyEdit が例外を投げました: ${message}`);
  }

  // LSP participation の有無を観測 (事後 dirty 差分)
  const 事後dirtyAll = vscode.workspace.textDocuments
    .filter((d) => d.isDirty)
    .map((d) => d.uri.fsPath);
  const dirtyAfter = 事後dirtyAll.filter((f) => !事前dirty.has(f));

  // 自動保存。rename + LSP participate で書かれた内容を確定。
  if (applied) {
    for (const f of dirtyAfter) {
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === f);
      if (doc?.isDirty) {
        try {
          await doc.save();
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          warnings.push(`保存失敗 ${f}: ${message}`);
        }
      }
    }
  }

  return {
    applied,
    observedSideEffects: {
      dirtyAfter,
      fileExistsNow: {
        oldPath: await ファイル存在確認(oldUri),
        newPath: await ファイル存在確認(newUri),
      },
    },
    pathAttributeUpdatesAdded,
    warnings,
  };
}

async function ファイル存在確認(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

// workspace 全体の Rust ファイルから `#[path = "<oldBasename>.<ext>"]` を探して
// 新ファイル名で書き換える追加 TextEdit を edit に注入する。
// 件数が膨れないよう Rust ファイルに限定 + 上限 200 件で停止。
async function path属性追加編集を全workspaceに注入する(
  edit: vscode.WorkspaceEdit,
  oldBasename: string,
  newBasename: string,
): Promise<number> {
  let 追加件数 = 0;
  // workspace 全 Rust ファイルから探索。findFiles は exclude を考慮しないので
  // node_modules / target / dist は明示除外。
  const rustFiles = await vscode.workspace.findFiles(
    "**/*.rs",
    "**/{target,node_modules,dist}/**",
    2000,
  );

  for (const uri of rustFiles) {
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      continue;
    }
    const 全文行: string[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
      全文行.push(doc.lineAt(i).text);
    }

    // 各行で #[path = "<oldBasename>.<ext>"] を探す
    for (let 行 = 0; 行 < 全文行.length; 行++) {
      const result = path属性編集を計算する(
        全文行,
        行,
        { oldName: oldBasename, newName: newBasename },
        0, // 走査上限 0 = 起点行のみ確認
      );
      if (result === null) continue;
      edit.replace(
        uri,
        new vscode.Range(
          new vscode.Position(result.range.start.line, result.range.start.character),
          new vscode.Position(result.range.end.line, result.range.end.character),
        ),
        result.newText,
      );
      追加件数 += 1;
      if (追加件数 >= 200) return 追加件数;
    }
  }
  return 追加件数;
}
