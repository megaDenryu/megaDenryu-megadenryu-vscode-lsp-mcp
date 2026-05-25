import { describe, expect, it } from "vitest";
import { ポート解決, 既定ポート } from "../src/shared/config";

describe("ポート解決", () => {
  it("undefined なら既定値を返す", () => {
    expect(ポート解決(undefined)).toBe(既定ポート);
  });
  it("空文字なら既定値を返す", () => {
    expect(ポート解決("")).toBe(既定ポート);
  });
  it("正の整数を解釈する", () => {
    expect(ポート解決("12345")).toBe(12345);
  });
  it("不正値で例外を投げる", () => {
    expect(() => ポート解決("abc")).toThrow();
    expect(() => ポート解決("0")).toThrow();
    expect(() => ポート解決("70000")).toThrow();
  });
});
