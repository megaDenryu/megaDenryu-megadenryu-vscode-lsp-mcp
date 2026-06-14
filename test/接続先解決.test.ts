import { describe, expect, it } from "vitest";
import type { 稼働インスタンス情報 } from "../src/shared/インスタンス登録簿";
import {
  MCP接続先を解決する,
  接続先解決エラー,
} from "../src/mcp/接続先解決";

const 更新日時 = new Date().toISOString();

function インスタンスを作る(
  識別子: string,
  ポート: number,
  フォルダ: string,
): 稼働インスタンス情報 {
  return {
    版: 1,
    インスタンス識別子: 識別子,
    プロセス識別子: 1234,
    ホスト: "127.0.0.1",
    ポート,
    ワークスペース名: 識別子,
    ワークスペースファイル: null,
    ワークスペースフォルダ群: [フォルダ],
    拡張バージョン: "0.2.0",
    起動日時: 更新日時,
    更新日時,
  };
}

describe("MCP接続先を解決する", () => {
  it("明示ポートを最優先する", async () => {
    const 結果 = await MCP接続先を解決する(
      { MEGADENRYU_LSP_MCP_PORT: "19000" },
      "C:\\devs\\PokemonBattleAI",
      { 一覧を取得する: async () => [] },
    );
    expect(結果).toEqual({ 種別: "明示ポート", ポート: 19000 });
  });

  it("現在ディレクトリに一致するワークスペースを選ぶ", async () => {
    const 対象 = インスタンスを作る(
      "PokemonBattleAI",
      30001,
      "C:\\devs\\PokemonBattleAI",
    );
    const 結果 = await MCP接続先を解決する(
      {},
      "C:\\devs\\PokemonBattleAI\\pokemon_battle_sim",
      { 一覧を取得する: async () => [対象] },
    );
    expect(結果.種別).toBe("ワークスペース自動選択");
    expect(結果.ポート).toBe(30001);
  });

  it("ワークスペース環境変数で対象を上書きする", async () => {
    const 一つ目 = インスタンスを作る("一つ目", 30001, "C:\\devs\\One");
    const 二つ目 = インスタンスを作る("二つ目", 30002, "C:\\devs\\Two");
    const 結果 = await MCP接続先を解決する(
      { MEGADENRYU_LSP_MCP_WORKSPACE: "C:\\devs\\Two" },
      "C:\\devs\\One",
      { 一覧を取得する: async () => [一つ目, 二つ目] },
    );
    expect(結果.ポート).toBe(30002);
  });

  it("登録情報が無い場合だけ旧版既定ポートを使う", async () => {
    const 結果 = await MCP接続先を解決する(
      {},
      "C:\\devs\\PokemonBattleAI",
      { 一覧を取得する: async () => [] },
    );
    expect(結果).toEqual({ 種別: "旧版互換", ポート: 17800 });
  });

  it("稼働中候補があるのに対象が一致しない場合は拒否する", async () => {
    const 候補 = インスタンスを作る("別対象", 30001, "C:\\devs\\Other");
    await expect(
      MCP接続先を解決する({}, "C:\\devs\\PokemonBattleAI", {
        一覧を取得する: async () => [候補],
      }),
    ).rejects.toBeInstanceOf(接続先解決エラー);
  });
});
