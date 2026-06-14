import { WebSocketServer } from "ws";
import { ホスト, 待受ポートを取得する } from "../shared/config";
import {
  インスタンス登録簿,
  type ワークスペース情報,
} from "../shared/インスタンス登録簿";
import type { RpcRequest, RpcResponse } from "../shared/protocol";
import { WebSocket接続管理 } from "./WebSocket接続管理";
import {
  WebSocket待受を開始する,
  実ポートを取得する,
} from "./WebSocket待受";
import {
  インスタンス公開,
} from "./インスタンス公開";
import type { 拡張設定, サーバー状態 } from "./サーバー状態";

type 状態購読解除 = { dispose(): void };
type リクエスト処理 = (req: RpcRequest) => Promise<RpcResponse>;

export class サーバー管理 {
  private サーバー: WebSocketServer | undefined;
  private readonly 購読者群 = new Set<(状態: サーバー状態) => void>();
  private readonly 接続管理: WebSocket接続管理;
  private readonly 公開管理: インスタンス公開;
  private 定期更新: NodeJS.Timeout | undefined;
  private 現在状態: サーバー状態 = { 種別: "停止中" };
  private 操作列: Promise<void> = Promise.resolve();

  constructor(
    private readonly 設定取得: () => 拡張設定,
    private readonly ワークスペース取得: () => ワークスペース情報,
    リクエストを処理する: リクエスト処理,
    private readonly ログ: (message: string) => void,
    登録簿: インスタンス登録簿 = new インスタンス登録簿(),
  ) {
    this.接続管理 = new WebSocket接続管理(
      リクエストを処理する,
      (接続数) => {
        this.稼働状態の接続数を更新する(接続数);
        void this.登録情報を更新する();
      },
      ログ,
    );
    this.公開管理 = new インスタンス公開(
      ワークスペース取得,
      ログ,
      登録簿,
    );
  }

  get インスタンス識別子(): string {
    return this.公開管理.インスタンス識別子;
  }

  状態を取得する(): サーバー状態 {
    return this.現在状態;
  }

  状態変更を購読する(
    購読者: (状態: サーバー状態) => void,
  ): 状態購読解除 {
    this.購読者群.add(購読者);
    return { dispose: () => this.購読者群.delete(購読者) };
  }

  private 状態を変更する(状態: サーバー状態): void {
    this.現在状態 = 状態;
    for (const 購読者 of this.購読者群) {
      購読者(状態);
    }
  }

  private 操作を予約する(操作: () => Promise<void>): Promise<void> {
    const 実行 = this.操作列.then(操作, 操作);
    this.操作列 = 実行.then(
      () => undefined,
      () => undefined,
    );
    return 実行;
  }

  起動する(): Promise<void> {
    return this.操作を予約する(() => this.起動処理());
  }

  private async 起動処理(): Promise<void> {
    if (
      this.現在状態.種別 === "起動中" ||
      this.現在状態.種別 === "稼働中"
    ) {
      return;
    }
    const 設定 = this.設定取得();
    const ワークスペース = this.ワークスペース取得();
    if (
      ワークスペース.ワークスペースフォルダ群.length === 0 &&
      ワークスペース.ワークスペースファイル === null
    ) {
      this.状態を変更する({
        種別: "失敗",
        理由: "ワークスペースが開かれていないため起動できません。",
        ポート設定: 設定.ポート設定,
      });
      return;
    }

    this.状態を変更する({
      種別: "起動中",
      ポート設定: 設定.ポート設定,
    });
    try {
      const サーバー = await WebSocket待受を開始する(
        待受ポートを取得する(設定.ポート設定),
        (接続) => this.接続管理.受け付ける(接続),
        this.ログ,
      );
      this.サーバー = サーバー;
      const 実ポート = 実ポートを取得する(サーバー);
      const 起動日時 = new Date().toISOString();
      this.状態を変更する({
        種別: "稼働中",
        ポート設定: 設定.ポート設定,
        実ポート,
        接続数: 0,
        起動日時,
        登録状態: { 種別: "未公開" },
      });
      this.公開管理.開始する();
      await this.登録情報を更新する();
      this.定期更新 = setInterval(() => {
        void this.登録情報を更新する();
      }, 5_000);
      this.ログ(`WebSocket server listening on ws://${ホスト}:${実ポート}`);
    } catch (error) {
      const 理由 = error instanceof Error ? error.message : String(error);
      this.サーバー = undefined;
      this.状態を変更する({
        種別: "失敗",
        理由,
        ポート設定: 設定.ポート設定,
      });
      this.ログ(`WebSocket server 起動失敗: ${理由}`);
    }
  }

  private 稼働状態の接続数を更新する(接続数: number): void {
    if (this.現在状態.種別 !== "稼働中") {
      return;
    }
    this.状態を変更する({
      ...this.現在状態,
      接続数,
    });
  }

  private async 登録情報を更新する(): Promise<void> {
    if (this.現在状態.種別 !== "稼働中") {
      return;
    }
    const 登録状態 = await this.公開管理.更新する({
      実ポート: this.現在状態.実ポート,
      起動日時: this.現在状態.起動日時,
    });
    if (this.現在状態.種別 === "稼働中") {
      this.状態を変更する({
        ...this.現在状態,
        登録状態,
      });
    }
  }

  停止する(): Promise<void> {
    return this.操作を予約する(() => this.停止処理());
  }

  private async 停止処理(): Promise<void> {
    if (this.現在状態.種別 === "停止中") {
      return;
    }
    this.状態を変更する({ 種別: "停止処理中" });
    if (this.定期更新 !== undefined) {
      clearInterval(this.定期更新);
      this.定期更新 = undefined;
    }
    this.接続管理.全て切断する();
    const サーバー = this.サーバー;
    this.サーバー = undefined;
    if (サーバー !== undefined) {
      await new Promise<void>((resolve) => {
        サーバー.close(() => resolve());
      });
    }
    await this.公開管理.削除する();
    this.状態を変更する({ 種別: "停止中" });
    this.ログ("WebSocket server stopped");
  }

  再起動する(): Promise<void> {
    return this.操作を予約する(async () => {
      await this.停止処理();
      await this.起動処理();
    });
  }

  async ワークスペース情報を更新する(): Promise<void> {
    await this.登録情報を更新する();
  }

  async dispose(): Promise<void> {
    await this.停止する();
    this.購読者群.clear();
  }
}
