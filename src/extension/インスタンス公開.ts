import { randomUUID } from "node:crypto";
import { ホスト } from "../shared/config";
import {
  インスタンス登録簿,
  type 稼働インスタンス情報,
  type ワークスペース情報,
} from "../shared/インスタンス登録簿";
import { 拡張バージョン } from "../shared/version";

export type 登録状態 =
  | { 種別: "未公開" }
  | { 種別: "公開済み"; 更新日時: string }
  | { 種別: "公開失敗"; 理由: string };

export type 公開内容 = {
  実ポート: number;
  起動日時: string;
};

export type 登録操作 = Pick<
  インスタンス登録簿,
  "登録する" | "削除する"
>;

export class インスタンス公開 {
  readonly インスタンス識別子 = randomUUID();
  private 公開中 = false;
  private 直列処理: Promise<void> = Promise.resolve();

  constructor(
    private readonly ワークスペース取得: () => ワークスペース情報,
    private readonly ログ: (message: string) => void,
    private readonly 登録簿: 登録操作,
  ) {}

  開始する(): void {
    this.公開中 = true;
  }

  async 更新する(内容: 公開内容): Promise<登録状態> {
    if (!this.公開中) {
      return { 種別: "未公開" };
    }
    const 更新処理 = this.直列処理.then(() => this.登録処理を行う(内容));
    this.直列処理 = 更新処理.then(
      () => {},
      () => {},
    );
    return 更新処理;
  }

  private async 登録処理を行う(内容: 公開内容): Promise<登録状態> {
    if (!this.公開中) {
      return { 種別: "未公開" };
    }
    const 更新日時 = new Date().toISOString();
    const 情報: 稼働インスタンス情報 = {
      版: 1,
      インスタンス識別子: this.インスタンス識別子,
      プロセス識別子: process.pid,
      ホスト,
      ポート: 内容.実ポート,
      ...this.ワークスペース取得(),
      拡張バージョン,
      起動日時: 内容.起動日時,
      更新日時,
    };
    try {
      await this.登録簿.登録する(情報);
      return { 種別: "公開済み", 更新日時 };
    } catch (error) {
      const 理由 = error instanceof Error ? error.message : String(error);
      this.ログ(`インスタンス登録失敗: ${理由}`);
      return { 種別: "公開失敗", 理由 };
    }
  }

  async 削除する(): Promise<void> {
    this.公開中 = false;
    await this.直列処理;
    try {
      await this.登録簿.削除する(this.インスタンス識別子);
    } catch (error) {
      const 理由 = error instanceof Error ? error.message : String(error);
      this.ログ(`インスタンス登録削除失敗: ${理由}`);
    }
  }
}
