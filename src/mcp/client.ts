// MCP server プロセス側の WebSocket クライアント。
// 拡張 (VSCode プロセス) に接続して JSON-RPC を投げる。
// 接続が落ちている場合は失敗エラーを返す (再接続は呼び出し側 retry に任せる)。

import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type {
  Request,
  ResultMap,
  RpcRequest,
  RpcResponse,
} from "../shared/protocol";
import { ホスト } from "../shared/config";

export class 拡張未起動エラー extends Error {
  constructor(message: string) {
    super(message);
    this.name = "拡張未起動エラー";
  }
}

type 待機中エントリ = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  method: string;
};

export class 拡張クライアント {
  private ws: WebSocket | undefined;
  private 待機中 = new Map<string, 待機中エントリ>();
  private 接続中プロミス: Promise<void> | undefined;

  constructor(private readonly port: number) {}

  async 接続(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.接続中プロミス) return this.接続中プロミス;

    this.接続中プロミス = new Promise<void>((resolve, reject) => {
      const url = `ws://${ホスト}:${this.port}`;
      const ws = new WebSocket(url, { handshakeTimeout: 5000 });
      const タイムアウト = setTimeout(() => {
        ws.terminate();
        reject(
          new 拡張未起動エラー(
            `VSCode 拡張に接続できません (${url})。VSCode で本拡張がインストール済みかつ起動済かを確認してください。`,
          ),
        );
      }, 5500);

      ws.once("open", () => {
        clearTimeout(タイムアウト);
        this.ws = ws;
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(タイムアウト);
        reject(
          new 拡張未起動エラー(
            `WebSocket 接続失敗 (${url}): ${err.message}`,
          ),
        );
      });
      ws.on("message", (raw) => this.受信(raw.toString()));
      ws.on("close", () => {
        this.ws = undefined;
        for (const [id, entry] of this.待機中) {
          entry.reject(new Error(`接続切断 (id=${id}, method=${entry.method})`));
        }
        this.待機中.clear();
      });
    }).finally(() => {
      this.接続中プロミス = undefined;
    });

    return this.接続中プロミス;
  }

  private 受信(text: string): void {
    let res: RpcResponse;
    try {
      res = JSON.parse(text) as RpcResponse;
    } catch (e) {
      // ID 不明な壊れ JSON は全 reject 対象にしない (他の応答を待つため)
      return;
    }
    const entry = this.待機中.get(res.id);
    if (!entry) return;
    this.待機中.delete(res.id);
    if ("error" in res) {
      entry.reject(
        new Error(`[${entry.method}] ${res.error.message} (code=${res.error.code})`),
      );
    } else {
      entry.resolve(res.result);
    }
  }

  async 呼び出し<M extends Request["method"]>(
    method: M,
    params: Extract<Request, { method: M }>["params"],
  ): Promise<ResultMap[M]> {
    await this.接続();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new 拡張未起動エラー("WebSocket が open 状態ではありません");
    }
    const id = randomUUID();
    const payload: RpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    } as RpcRequest;
    return await new Promise<ResultMap[M]>((resolve, reject) => {
      this.待機中.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        method,
      });
      this.ws!.send(JSON.stringify(payload), (err) => {
        if (err) {
          this.待機中.delete(id);
          reject(err);
        }
      });
    });
  }

  閉じる(): void {
    this.ws?.close();
    this.ws = undefined;
  }
}
