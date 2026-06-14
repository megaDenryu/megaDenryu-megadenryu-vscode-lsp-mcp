import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ファイル排他制御 } from "../src/shared/ファイル排他制御";

const 作成ディレクトリ群: string[] = [];

afterEach(async () => {
  for (const ディレクトリ of 作成ディレクトリ群.splice(0)) {
    await rm(ディレクトリ, { recursive: true, force: true });
  }
});

describe("ファイル排他制御", () => {
  it("終了済みプロセスのロックを回収する", async () => {
    const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-lock-"));
    作成ディレクトリ群.push(ディレクトリ);
    const ロックパス = join(ディレクトリ, "assignment.lock");
    await writeFile(
      ロックパス,
      JSON.stringify({ processId: 2_147_483_647, time: Date.now() }),
      "utf8",
    );
    const 制御 = new ファイル排他制御(ロックパス);

    const 結果 = await 制御.実行する(async () => "実行済み");

    expect(結果).toBe("実行済み");
  });
});
