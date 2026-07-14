import { describe, expect, it } from "vitest";
import { 起動失敗理由を作る } from "../src/extension/起動競合理由";

describe("起動失敗理由を作る", () => {
  it("登録されたVS Codeが見つからなければ別アプリと表示する", async () => {
    const エラー = Object.assign(new Error("address in use"), {
      code: "EADDRINUSE",
    });
    const 理由 = await 起動失敗理由を作る(
      エラー,
      17800,
      { 一覧を取得する: async () => [] },
      () => {},
    );

    expect(理由).toContain("別のアプリケーション");
    expect(理由).toContain("変更していません");
  });
});
