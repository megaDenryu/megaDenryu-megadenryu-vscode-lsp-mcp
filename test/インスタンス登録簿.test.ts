import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  インスタンス登録簿,
  対象インスタンスを選択する,
  type 稼働インスタンス情報,
} from "../src/shared/インスタンス登録簿";

const 作成ディレクトリ群: string[] = [];
const 現在日時 = "2026-06-15T00:00:10.000Z";
const 現在時刻 = Date.parse(現在日時);

function インスタンスを作る(
  識別子: string,
  ワークスペースフォルダ: string,
  更新日時 = 現在日時,
): 稼働インスタンス情報 {
  return {
    版: 1,
    インスタンス識別子: 識別子,
    プロセス識別子: 1234,
    ホスト: "127.0.0.1",
    ポート: 30000,
    ワークスペース名: 識別子,
    ワークスペースファイル: null,
    ワークスペースフォルダ群: [ワークスペースフォルダ],
    拡張バージョン: "0.2.0",
    起動日時: "2026-06-15T00:00:00.000Z",
    更新日時,
  };
}

afterEach(async () => {
  for (const ディレクトリ of 作成ディレクトリ群.splice(0)) {
    await rm(ディレクトリ, { recursive: true, force: true });
  }
});

describe("対象インスタンスを選択する", () => {
  it("対象ファイルを含むワークスペースを選ぶ", () => {
    const 対象 = インスタンスを作る("対象", "C:\\devs\\PokemonBattleAI");
    const 別対象 = インスタンスを作る("別対象", "C:\\devs\\Other");
    expect(
      対象インスタンスを選択する(
        "C:\\devs\\PokemonBattleAI\\pokemon_battle_sim",
        [別対象, 対象],
        現在時刻,
      ),
    ).toEqual({ 種別: "選択済み", インスタンス: 対象 });
  });

  it("入れ子のワークスペースでは最も長く一致する方を選ぶ", () => {
    const 親 = インスタンスを作る("親", "C:\\devs");
    const 子 = インスタンスを作る("子", "C:\\devs\\PokemonBattleAI");
    expect(
      対象インスタンスを選択する(
        "C:\\devs\\PokemonBattleAI",
        [親, 子],
        現在時刻,
      ),
    ).toEqual({ 種別: "選択済み", インスタンス: 子 });
  });

  it("同じワークスペースを複数ウィンドウで開いている場合は拒否する", () => {
    const 一つ目 = インスタンスを作る("一つ目", "C:\\devs\\PokemonBattleAI");
    const 二つ目 = インスタンスを作る("二つ目", "C:\\devs\\PokemonBattleAI");
    const 結果 = 対象インスタンスを選択する(
      "C:\\devs\\PokemonBattleAI",
      [一つ目, 二つ目],
      現在時刻,
    );
    expect(結果.種別).toBe("複数候補");
  });

  it("ワークスペースファイルの完全一致を優先する", () => {
    const 複数ルート = {
      ...インスタンスを作る("複数ルート", "C:\\devs\\One"),
      ワークスペースファイル: "C:\\workspaces\\main.code-workspace",
    };
    const 別対象 = インスタンスを作る("別対象", "C:\\workspaces");
    expect(
      対象インスタンスを選択する(
        "C:\\workspaces\\main.code-workspace",
        [別対象, 複数ルート],
        現在時刻,
      ),
    ).toEqual({ 種別: "選択済み", インスタンス: 複数ルート });
  });

  it("更新が止まった登録情報を候補から除く", () => {
    const 古い = インスタンスを作る(
      "古い",
      "C:\\devs\\PokemonBattleAI",
      "2026-06-14T23:00:00.000Z",
    );
    expect(
      対象インスタンスを選択する(
        "C:\\devs\\PokemonBattleAI",
        [古い],
        現在時刻,
      ),
    ).toEqual({ 種別: "未検出", 候補群: [] });
  });
});

describe("インスタンス登録簿", () => {
  it("登録・一覧取得・削除を行う", async () => {
    const ディレクトリ = await mkdtemp(
      join(tmpdir(), "megadenryu-lsp-mcp-test-"),
    );
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 情報 = インスタンスを作る("試験", "C:\\devs\\PokemonBattleAI");

    await 登録簿.登録する(情報);
    expect(await 登録簿.一覧を取得する(現在時刻)).toEqual([情報]);

    await 登録簿.削除する(情報.インスタンス識別子);
    expect(await 登録簿.一覧を取得する(現在時刻)).toEqual([]);
  });

  it("同じ識別子を完全なファイルで更新する", async () => {
    const ディレクトリ = await mkdtemp(
      join(tmpdir(), "megadenryu-lsp-mcp-test-"),
    );
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 更新前 = インスタンスを作る(
      "更新試験",
      "C:\\devs\\PokemonBattleAI",
    );
    const 更新後 = {
      ...更新前,
      ポート: 30001,
      更新日時: "2026-06-15T00:00:11.000Z",
    };

    await 登録簿.登録する(更新前);
    await 登録簿.登録する(更新後);

    expect(await 登録簿.一覧を取得する(Date.parse(更新後.更新日時))).toEqual([
      更新後,
    ]);
    expect(await readdir(ディレクトリ)).toEqual(["更新試験.json"]);
  });
});
