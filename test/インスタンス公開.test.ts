import { describe, expect, it } from "vitest";
import { インスタンス公開 } from "../src/extension/インスタンス公開";

describe("インスタンス公開", () => {
  it("停止時は進行中の登録を待ってから最後に削除する", async () => {
    const 操作順: string[] = [];
    let 登録完了解放: (() => void) | undefined;
    const 登録完了待ち = new Promise<void>((resolve) => {
      登録完了解放 = resolve;
    });
    const 公開 = new インスタンス公開(
      () => ({
        ワークスペース名: "試験",
        ワークスペースファイル: null,
        ワークスペースフォルダ群: ["C:\\devs\\Test"],
      }),
      () => {},
      {
        登録する: async () => {
          操作順.push("登録開始");
          await 登録完了待ち;
          操作順.push("登録完了");
        },
        削除する: async () => {
          操作順.push("削除");
        },
      },
    );
    公開.開始する();
    const 更新処理 = 公開.更新する({
      実ポート: 30000,
      起動日時: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const 削除処理 = 公開.削除する();
    登録完了解放?.();
    await Promise.all([更新処理, 削除処理]);

    expect(操作順).toEqual(["登録開始", "登録完了", "削除"]);
  });
});
