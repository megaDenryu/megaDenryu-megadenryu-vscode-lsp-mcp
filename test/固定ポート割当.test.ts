import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { 固定ポート割当 } from "../src/shared/固定ポート割当";
import type { ワークスペース情報 } from "../src/shared/インスタンス登録簿";

const 作成ディレクトリ群: string[] = [];

function ワークスペースを作る(名前: string): ワークスペース情報 {
  return {
    ワークスペース名: 名前,
    ワークスペースファイル: null,
    ワークスペースフォルダ群: [`C:\\devs\\${名前}`],
  };
}

async function 割当管理を作る(
  使用中ポート群: ReadonlySet<number> = new Set(),
): Promise<固定ポート割当> {
  const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-assign-"));
  作成ディレクトリ群.push(ディレクトリ);
  return new 固定ポート割当(
    join(ディレクトリ, "assignments.json"),
    async (ポート) => 使用中ポート群.has(ポート),
  );
}

afterEach(async () => {
  for (const ディレクトリ of 作成ディレクトリ群.splice(0)) {
    await rm(ディレクトリ, { recursive: true, force: true });
  }
});

describe("固定ポート割当", () => {
  it("同じワークスペースは再起動後も同じ番号を使う", async () => {
    const 管理 = await 割当管理を作る();
    const 対象 = ワークスペースを作る("Same");

    const 初回 = await 管理.初回割当する(対象);
    const 再取得 = await 管理.初回割当する(対象);

    expect(初回).toEqual({ 種別: "確定", ポート: 17800, 新規割当: true });
    expect(再取得).toEqual({
      種別: "確定",
      ポート: 17800,
      新規割当: false,
    });
  });

  it("異なるワークスペースへ異なる番号を割り当てる", async () => {
    const 管理 = await 割当管理を作る();
    const 一つ目 = await 管理.初回割当する(ワークスペースを作る("One"));
    const 二つ目 = await 管理.初回割当する(ワークスペースを作る("Two"));

    expect(一つ目.種別 === "確定" && 一つ目.ポート).toBe(17800);
    expect(二つ目.種別 === "確定" && 二つ目.ポート).toBe(17801);
  });

  it("初回割当では他プロセスが使用中の番号を飛ばす", async () => {
    const 管理 = await 割当管理を作る(new Set([17800, 17801]));
    const 結果 = await 管理.初回割当する(ワークスペースを作る("Used"));

    expect(結果.種別 === "確定" && 結果.ポート).toBe(17802);
  });

  it("他ワークスペースへ割当済みの手動指定を拒否する", async () => {
    const 管理 = await 割当管理を作る();
    await 管理.既存設定を登録する(
      ワークスペースを作る("One"),
      19000,
    );

    const 結果 = await 管理.手動変更する(
      ワークスペースを作る("Two"),
      19000,
    );

    expect(結果).toEqual({
      種別: "競合",
      理由: "ポート 19000 はワークスペース「One」に割り当て済みです。",
    });
  });

  it("他プロセスが使用中の手動指定を拒否する", async () => {
    const 管理 = await 割当管理を作る(new Set([19000]));
    const 結果 = await 管理.手動変更する(
      ワークスペースを作る("One"),
      19000,
    );

    expect(結果).toEqual({
      種別: "競合",
      理由: "ポート 19000 は現在ほかのプロセスが使用しています。",
    });
  });

  it("同時割当でも番号を重複させない", async () => {
    const 管理 = await 割当管理を作る();
    const [一つ目, 二つ目] = await Promise.all([
      管理.初回割当する(ワークスペースを作る("One")),
      管理.初回割当する(ワークスペースを作る("Two")),
    ]);

    expect(一つ目.種別).toBe("確定");
    expect(二つ目.種別).toBe("確定");
    if (一つ目.種別 === "確定" && 二つ目.種別 === "確定") {
      expect(一つ目.ポート).not.toBe(二つ目.ポート);
    }
  });
});
