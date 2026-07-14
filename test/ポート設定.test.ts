import { describe, expect, it } from "vitest";
import {
  待受ポートを取得する,
  環境変数ポートを解釈する,
  ポート設定を解釈する,
  保存済みポートを解釈する,
} from "../src/shared/config";

describe("ポート設定", () => {
  it("1 から 65535 は固定ポートとして扱う", () => {
    const 設定 = ポート設定を解釈する(17800);
    expect(設定).toEqual({
      種別: "固定",
      ポート: 17800,
    });
    expect(待受ポートを取得する(設定)).toBe(17800);
    expect(ポート設定を解釈する(65535)).toEqual({
      種別: "固定",
      ポート: 65535,
    });
  });

  it("範囲外と小数を拒否する", () => {
    expect(() => ポート設定を解釈する(-1)).toThrow();
    expect(() => ポート設定を解釈する(0)).toThrow();
    expect(() => ポート設定を解釈する(65536)).toThrow();
    expect(() => ポート設定を解釈する(1.5)).toThrow();
  });

  it("保存値がない場合だけ未設定として扱う", () => {
    expect(保存済みポートを解釈する(undefined)).toBeUndefined();
    expect(保存済みポートを解釈する(null)).toBeUndefined();
    expect(保存済みポートを解釈する(17800)).toBe(17800);
  });

  it("環境変数が未指定なら undefined を返す", () => {
    expect(環境変数ポートを解釈する(undefined)).toBeUndefined();
    expect(環境変数ポートを解釈する("")).toBeUndefined();
  });

  it("環境変数の固定ポートを検証する", () => {
    expect(環境変数ポートを解釈する("17801")).toBe(17801);
    expect(() => 環境変数ポートを解釈する("0")).toThrow();
    expect(() => 環境変数ポートを解釈する("abc")).toThrow();
  });
});
