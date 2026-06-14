import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { インスタンス登録簿 } from "../src/shared/インスタンス登録簿";
import type { RpcResponse } from "../src/shared/protocol";
import { サーバー管理 } from "../src/extension/サーバー管理";

const 管理群: サーバー管理[] = [];
const 作成ディレクトリ群: string[] = [];

function 試験用応答(id: string): RpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      pong: true,
      extensionVersion: "0.2.0",
      workspaceFolders: ["C:\\devs\\Test"],
    },
  };
}

async function 管理を作る(
  登録簿: インスタンス登録簿,
  ワークスペース名: string,
  ポート設定値 = 0,
): Promise<サーバー管理> {
  const 管理 = new サーバー管理(
    () => ({
      ポート設定:
        ポート設定値 === 0
          ? { 種別: "自動割り当て" }
          : { 種別: "固定", ポート: ポート設定値 },
      自動起動: true,
    }),
    () => ({
      ワークスペース名,
      ワークスペースファイル: null,
      ワークスペースフォルダ群: [`C:\\devs\\${ワークスペース名}`],
    }),
    async (request) => 試験用応答(request.id),
    () => {},
    登録簿,
  );
  管理群.push(管理);
  return 管理;
}

function 稼働状態を得る(管理: サーバー管理) {
  const 状態 = 管理.状態を取得する();
  if (状態.種別 !== "稼働中") {
    throw new Error(`稼働中ではありません: ${状態.種別}`);
  }
  return 状態;
}

function 接続する(ポート: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const 接続 = new WebSocket(`ws://127.0.0.1:${ポート}`);
    接続.once("open", () => resolve(接続));
    接続.once("error", reject);
  });
}

function 切断を待つ(接続: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    接続.once("close", () => resolve());
    接続.close();
  });
}

async function 条件を待つ(条件: () => boolean): Promise<void> {
  const 期限 = Date.now() + 1_000;
  while (!条件()) {
    if (Date.now() >= 期限) {
      throw new Error("状態更新の待機時間を超過しました。");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(async () => {
  for (const 管理 of 管理群.splice(0)) {
    await 管理.dispose();
  }
  for (const ディレクトリ of 作成ディレクトリ群.splice(0)) {
    await rm(ディレクトリ, { recursive: true, force: true });
  }
});

describe("サーバー管理", () => {
  it("複数ワークスペースが自動割り当てで同時起動する", async () => {
    const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-server-"));
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 一つ目 = await 管理を作る(登録簿, "One");
    const 二つ目 = await 管理を作る(登録簿, "Two");

    await Promise.all([一つ目.起動する(), 二つ目.起動する()]);

    const 一つ目状態 = 稼働状態を得る(一つ目);
    const 二つ目状態 = 稼働状態を得る(二つ目);
    expect(一つ目状態.実ポート).not.toBe(二つ目状態.実ポート);
    expect(await 登録簿.一覧を取得する()).toHaveLength(2);
  });

  it("接続数と RPC 応答を実 WebSocket で更新する", async () => {
    const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-server-"));
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 管理 = await 管理を作る(登録簿, "Connect");
    await 管理.起動する();
    const 接続 = await 接続する(稼働状態を得る(管理).実ポート);
    expect(稼働状態を得る(管理).接続数).toBe(1);

    const 応答 = new Promise<string>((resolve) => {
      接続.once("message", (raw) => resolve(raw.toString()));
    });
    接続.send(
      JSON.stringify({ jsonrpc: "2.0", id: "1", method: "ping", params: {} }),
    );
    expect(JSON.parse(await 応答)).toMatchObject({
      jsonrpc: "2.0",
      id: "1",
      result: { pong: true },
    });

    await 切断を待つ(接続);
    await 条件を待つ(() => 稼働状態を得る(管理).接続数 === 0);
    expect(稼働状態を得る(管理).接続数).toBe(0);
  });

  it("固定ポートの競合を失敗状態として報告する", async () => {
    const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-server-"));
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 一つ目 = await 管理を作る(登録簿, "FixedOne");
    await 一つ目.起動する();
    const 使用中ポート = 稼働状態を得る(一つ目).実ポート;
    const 二つ目 = await 管理を作る(登録簿, "FixedTwo", 使用中ポート);
    await 二つ目.起動する();

    expect(一つ目.状態を取得する().種別).toBe("稼働中");
    const 二つ目状態 = 二つ目.状態を取得する();
    expect(二つ目状態.種別).toBe("失敗");
    if (二つ目状態.種別 === "失敗") {
      expect(二つ目状態.理由).toContain("EADDRINUSE");
    }
  });

  it("停止時に登録情報を削除する", async () => {
    const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-server-"));
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 管理 = await 管理を作る(登録簿, "Stop");
    await 管理.起動する();
    expect(await 登録簿.一覧を取得する()).toHaveLength(1);

    await 管理.停止する();
    expect(await 登録簿.一覧を取得する()).toEqual([]);
  });

  it("重なった起動と再起動を順番に処理する", async () => {
    const ディレクトリ = await mkdtemp(join(tmpdir(), "lsp-mcp-server-"));
    作成ディレクトリ群.push(ディレクトリ);
    const 登録簿 = new インスタンス登録簿(ディレクトリ);
    const 管理 = await 管理を作る(登録簿, "Serialized");

    await Promise.all([
      管理.起動する(),
      管理.再起動する(),
      管理.起動する(),
    ]);

    expect(管理.状態を取得する().種別).toBe("稼働中");
    expect(await 登録簿.一覧を取得する()).toHaveLength(1);
    const 接続 = await 接続する(稼働状態を得る(管理).実ポート);
    await 切断を待つ(接続);
  });
});
