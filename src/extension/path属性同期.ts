// P1.2: Rust モジュール rename (`pub mod X;` → `pub mod Y;`) を検知して、
// 同行/直前数行にある `#[path = "X.rs"]` 属性も `#[path = "Y.rs"]` に書き換える
// 追加 TextEdit を生成する。
//
// なぜ必要か:
// LSP rename は識別子参照しか辿らない仕様。文字列リテラル内の "ファイル名"
// は touch されないため、`#[path]` 属性が古いファイル名を指したまま残り、
// rust-analyzer が「ファイルが見つからない」エラーを出す。本拡張は LSP 仕様
// の外で必要な追加編集を WorkspaceEdit に注入することでこの穴を埋める。
//
// 本ファイルは vscode 依存のない純粋ロジックのみ。vscode API 経由部分は
// 呼び出し側 (handlers.ts) が担当する。

export type 範囲 = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

export type 追加テキスト編集 = {
  range: 範囲;
  newText: string;
};

export type Mod宣言Rename = {
  oldName: string;
  newName: string;
};

// mod 宣言の TextEdit から rename 内容を抽出する。
// 例: `pub mod ビルド構築;` の `ビルド構築` を `ポケモン型構築` に置き換える
// TextEdit が来たら { oldName: "ビルド構築", newName: "ポケモン型構築" } を返す。
//
// range の前後テキストが `pub mod ` ... `;` のパターンを満たすかで判定する。
// mod 宣言以外 (struct / fn / use 等) は null を返す → path 同期対象外。
export function mod宣言renameを検出する(
  対象行テキスト: string,
  編集range: 範囲,
  newText: string,
): Mod宣言Rename | null {
  if (編集range.start.line !== 編集range.end.line) return null;

  const 前 = 対象行テキスト.slice(0, 編集range.start.character);
  const 後 = 対象行テキスト.slice(編集range.end.character);
  const oldName = 対象行テキスト.slice(
    編集range.start.character,
    編集range.end.character,
  );

  // `pub mod ` / `pub(crate) mod ` / `mod ` の末尾 = 編集開始
  // 行頭からの空白を許容
  const mod宣言前置パターン = /^\s*(?:pub(?:\(.+?\))?\s+)?mod\s+$/;
  // 編集後は `;` または ` {` で終わる (block mod)
  const mod宣言後置パターン = /^\s*[;{]/;

  if (!mod宣言前置パターン.test(前)) return null;
  if (!mod宣言後置パターン.test(後)) return null;
  if (oldName.length === 0 || newText.length === 0) return null;

  return { oldName, newName: newText };
}

// 指定ファイル全文 (行配列) と mod 宣言の行番号を渡し、上方向に最大
// `走査上限行数` だけスキャンして `#[path = "<oldName>.<ext>"]` パターンを探す。
// 見つかったら新ファイル名で書き換える追加 TextEdit を返す。
//
// 同じ mod の上に `#[cfg(...)]` 等の別属性が挟まっていても、path 属性が
// 上限内にあれば拾う。複数 path 属性が並んでいる場合は一致した最初のものだけ。
export function path属性編集を計算する(
  ファイル全文行: readonly string[],
  mod宣言行番号: number,
  rename: Mod宣言Rename,
  走査上限行数: number = 5,
): 追加テキスト編集 | null {
  // path 属性内の文字列リテラル部分 (basename と拡張子) を捕まえる。
  // mod 宣言と同じ行に `#[path = "..."] pub mod X;` で書かれる場合もあるので、
  // 起点を mod 宣言行自身に置き、そこから上方向 (= 編集行から含めて) スキャン。
  const 走査開始 = Math.max(0, mod宣言行番号 - 走査上限行数);

  for (let 行 = mod宣言行番号; 行 >= 走査開始; 行--) {
    const テキスト = ファイル全文行[行];
    if (テキスト === undefined) continue;

    // `#[path = "<basename>.<ext>"]` を拾う。ファイル名部分の開始/終了位置も知りたい。
    const match = テキスト.match(/#\[\s*path\s*=\s*"([^"]+)"\s*\]/);
    if (!match) continue;
    const value = match[1];
    if (value === undefined) continue;
    const 値オフセット = テキスト.indexOf(value, match.index ?? 0);
    if (値オフセット < 0) continue;

    // value から拡張子と basename を分離。`.rs` 以外も将来許容するため任意拡張子。
    const ドット位置 = value.lastIndexOf(".");
    const basename = ドット位置 < 0 ? value : value.slice(0, ドット位置);
    const ext = ドット位置 < 0 ? "" : value.slice(ドット位置); // ".rs" 含む

    if (basename !== rename.oldName) continue;

    const 新value = rename.newName + ext;

    return {
      range: {
        start: { line: 行, character: 値オフセット },
        end: { line: 行, character: 値オフセット + value.length },
      },
      newText: 新value,
    };
  }

  return null;
}
