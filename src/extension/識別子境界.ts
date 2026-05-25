// P1.1: 与えられた position が識別子境界外だった場合、vscode.prepareRename を
// 使って rename 可能な範囲 (識別子の Range) を取得し、その範囲先頭に position を
// 補正する。位置が rename 可能ですらない (識別子の外) なら理由を返す。
//
// vscode.prepareRename は LSP の textDocument/prepareRename に橋渡しされ、
// rust-analyzer / tsserver 等が「この位置のシンボルは rename 可能か」「対象の
// テキスト範囲は何か」を返す。これを使えば「char=8 で先頭から外、char=11 で
// 中央 → 成功」の試行錯誤を呼び出し側がしなくて済む。

import * as vscode from "vscode";
import type { 位置補正情報 } from "../shared/protocol";
import { 周辺オフセット列を生成する } from "./周辺オフセット";

export type 補正成功 = {
  種別: "成功";
  位置: vscode.Position;
  // 与えられた位置が rename 範囲内だったので補正不要 → null
  // 範囲外だったので範囲先頭に補正した → 補正情報を返す
  補正情報: 位置補正情報 | null;
};

export type 補正失敗 = {
  種別: "失敗";
  理由: string;
};

export type 補正結果 = 補正成功 | 補正失敗;

export async function 位置を識別子境界に補正する(
  uri: vscode.Uri,
  与えられた位置: vscode.Position,
): Promise<補正結果> {
  // 第 1 段: 与えられた位置で prepareRename を試行
  const 一発目 = await prepareRenameを実行する(uri, 与えられた位置);
  if (一発目.成功) {
    return prepare成功から補正結果を作る(一発目.range, 与えられた位置, "prepareRename 1 発目で成功");
  }

  // 第 2 段: 同行内で前後の位置を線形試行 (識別子の先頭/末尾近傍を狙う)
  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      種別: "失敗",
      理由: `prepareRename 失敗 (${一発目.理由}) + 文書を開けず: ${message}`,
    };
  }
  if (与えられた位置.line >= document.lineCount) {
    return {
      種別: "失敗",
      理由: `prepareRename 失敗 (${一発目.理由}) + 指定行 ${与えられた位置.line} は文書の範囲外`,
    };
  }
  const 行テキスト = document.lineAt(与えられた位置.line).text;
  const 候補オフセット群 = 周辺オフセット列を生成する(
    与えられた位置.character,
    行テキスト.length,
  );

  for (const character of 候補オフセット群) {
    const 試行位置 = new vscode.Position(与えられた位置.line, character);
    const 試行 = await prepareRenameを実行する(uri, 試行位置);
    if (試行.成功) {
      return prepare成功から補正結果を作る(
        試行.range,
        与えられた位置,
        `prepareRename ${character} 文字目で成功 (与えられた位置 ${与えられた位置.character} は識別子外)`,
      );
    }
  }

  return {
    種別: "失敗",
    理由: `prepareRename 失敗 (${一発目.理由}) + 同行内 ${候補オフセット群.length} 候補も全て失敗 (行内に rename 可能な識別子なし)`,
  };
}

type Prepare試行結果 =
  | { 成功: true; range: vscode.Range }
  | { 成功: false; 理由: string };

async function prepareRenameを実行する(
  uri: vscode.Uri,
  位置: vscode.Position,
): Promise<Prepare試行結果> {
  let raw: unknown;
  try {
    raw = await vscode.commands.executeCommand(
      "vscode.prepareRename",
      uri,
      位置,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { 成功: false, 理由: message };
  }
  if (!raw) return { 成功: false, 理由: "prepareRename が undefined を返却" };
  const range = prepare結果範囲を取り出す(raw);
  if (!range) {
    return { 成功: false, 理由: `戻り値を解釈できず: ${JSON.stringify(raw)}` };
  }
  return { 成功: true, range };
}

function prepare成功から補正結果を作る(
  range: vscode.Range,
  与えられた位置: vscode.Position,
  補正reason: string,
): 補正成功 {
  if (range.contains(与えられた位置)) {
    return { 種別: "成功", 位置: 与えられた位置, 補正情報: null };
  }
  return {
    種別: "成功",
    位置: range.start,
    補正情報: {
      from: { line: 与えられた位置.line, character: 与えられた位置.character },
      to: { line: range.start.line, character: range.start.character },
      reason: 補正reason,
    },
  };
}

function prepare結果範囲を取り出す(値: unknown): vscode.Range | null {
  if (値 instanceof vscode.Range) return 値;
  if (
    typeof 値 === "object" &&
    値 !== null &&
    "range" in 値 &&
    (値 as { range: unknown }).range instanceof vscode.Range
  ) {
    return (値 as { range: vscode.Range }).range;
  }
  return null;
}
