import { describe, expect, it } from "vitest";
import {
  mod宣言renameを検出する,
  path属性編集を計算する,
} from "../src/extension/path属性同期";

describe("mod宣言renameを検出する", () => {
  it("`pub mod X;` の X を rename した編集を mod 宣言 rename と判定する", () => {
    const result = mod宣言renameを検出する(
      "pub mod ビルド構築;",
      { start: { line: 0, character: 8 }, end: { line: 0, character: 13 } },
      "ポケモン型構築",
    );
    expect(result).toEqual({ oldName: "ビルド構築", newName: "ポケモン型構築" });
  });

  it("`pub(crate) mod X;` も検知する", () => {
    // "pub(crate) mod " の長さは 15、"内部モジュール" は 7 文字
    const result = mod宣言renameを検出する(
      "pub(crate) mod 内部モジュール;",
      { start: { line: 0, character: 15 }, end: { line: 0, character: 22 } },
      "新名前",
    );
    expect(result?.oldName).toBe("内部モジュール");
    expect(result?.newName).toBe("新名前");
  });

  it("`mod X { ... }` block mod も検知する", () => {
    const result = mod宣言renameを検出する(
      "mod テスト {",
      { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
      "リネーム後",
    );
    expect(result).toEqual({ oldName: "テスト", newName: "リネーム後" });
  });

  it("`use X;` は mod 宣言ではないので null", () => {
    const result = mod宣言renameを検出する(
      "use ビルド構築;",
      { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
      "ポケモン型構築",
    );
    expect(result).toBeNull();
  });

  it("`struct X` も null", () => {
    const result = mod宣言renameを検出する(
      "pub struct ビルド構築 {",
      { start: { line: 0, character: 11 }, end: { line: 0, character: 16 } },
      "新名",
    );
    expect(result).toBeNull();
  });

  it("複数行に跨がる編集は null", () => {
    const result = mod宣言renameを検出する(
      "pub mod X;",
      { start: { line: 0, character: 8 }, end: { line: 1, character: 0 } },
      "Y",
    );
    expect(result).toBeNull();
  });
});

describe("path属性編集を計算する", () => {
  it("`#[path = \"X.rs\"]` の直下の mod 宣言を rename した場合、X.rs を新名.rs に書き換える", () => {
    const 行: string[] = [
      '#[path = "ビルド構築.rs"]',
      "pub mod ビルド構築;",
    ];
    const result = path属性編集を計算する(
      行,
      1,
      { oldName: "ビルド構築", newName: "ポケモン型構築" },
    );
    expect(result).not.toBeNull();
    expect(result?.newText).toBe("ポケモン型構築.rs");
    expect(result?.range.start.line).toBe(0);
    // `#[path = "` の長さは 10 文字
    expect(result?.range.start.character).toBe(10);
    expect(result?.range.end.character).toBe(10 + "ビルド構築.rs".length);
  });

  it("`#[cfg(...)]` が間に挟まっていても拾う (走査上限内)", () => {
    const 行: string[] = [
      '#[path = "ビルド構築.rs"]',
      '#[cfg(feature = "serde")]',
      "pub mod ビルド構築;",
    ];
    const result = path属性編集を計算する(
      行,
      2,
      { oldName: "ビルド構築", newName: "ポケモン型構築" },
    );
    expect(result?.newText).toBe("ポケモン型構築.rs");
    expect(result?.range.start.line).toBe(0);
  });

  it("path 属性内の basename が rename 対象と一致しない場合は null", () => {
    const 行: string[] = [
      '#[path = "別ファイル.rs"]',
      "pub mod ビルド構築;",
    ];
    const result = path属性編集を計算する(
      行,
      1,
      { oldName: "ビルド構築", newName: "ポケモン型構築" },
    );
    expect(result).toBeNull();
  });

  it("path 属性がない場合は null", () => {
    const 行: string[] = ["pub mod ビルド構築;"];
    const result = path属性編集を計算する(
      行,
      0,
      { oldName: "ビルド構築", newName: "ポケモン型構築" },
    );
    expect(result).toBeNull();
  });

  it("走査上限を超えた距離にある path 属性は無視", () => {
    const 行: string[] = [
      '#[path = "ビルド構築.rs"]',
      "",
      "",
      "",
      "",
      "",
      "",
      "pub mod ビルド構築;",
    ];
    const result = path属性編集を計算する(
      行,
      7,
      { oldName: "ビルド構築", newName: "ポケモン型構築" },
      5,
    );
    expect(result).toBeNull();
  });

  it("拡張子が .rs 以外でも basename 一致なら拡張子を保ったまま書き換え", () => {
    const 行: string[] = [
      '#[path = "サブ.rs.bak"]',
      "pub mod サブ;",
    ];
    // basename = "サブ.rs" (最後のドットで分割するので)、ext = ".bak"
    // oldName="サブ" は basename と不一致なので null になる
    const result = path属性編集を計算する(
      行,
      1,
      { oldName: "サブ", newName: "新サブ" },
    );
    expect(result).toBeNull();
  });

  it("同行に path 属性と mod 宣言がある場合も検出 (走査開始 = mod 宣言行)", () => {
    const 行: string[] = ['#[path = "X.rs"] pub mod X;'];
    const result = path属性編集を計算する(
      行,
      0,
      { oldName: "X", newName: "Y" },
    );
    expect(result?.newText).toBe("Y.rs");
    expect(result?.range.start.line).toBe(0);
  });
});
