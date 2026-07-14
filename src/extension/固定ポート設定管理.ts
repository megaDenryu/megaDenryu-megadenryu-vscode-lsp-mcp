import {
  ポート設定を解釈する,
  保存済みポートを解釈する,
  type ポート設定,
} from "../shared/config";
import type { ポート割当結果 } from "../shared/固定ポート割当";
import type { ワークスペース情報 } from "../shared/インスタンス登録簿";

export type 設定反映結果 =
  | { 種別: "確定"; ポート: number; 変更あり: boolean }
  | { 種別: "競合"; 理由: string };

type ポート割当操作 = {
  初回割当する(
    ワークスペース: ワークスペース情報,
  ): Promise<ポート割当結果>;
  既存設定を登録する(
    ワークスペース: ワークスペース情報,
    ポート: number,
  ): Promise<ポート割当結果>;
  手動変更する(
    ワークスペース: ワークスペース情報,
    ポート: number,
  ): Promise<ポート割当結果>;
};

export class 固定ポート設定管理 {
  private 現在ポート: number | undefined;
  private 起動禁止理由: string | undefined;

  constructor(
    private readonly 割当管理: ポート割当操作,
    private readonly ワークスペース取得: () => ワークスペース情報,
    private readonly 設定値取得: () => number | null | undefined,
    private readonly 設定値保存: (ポート: number) => Promise<void>,
  ) {}

  async 初期化する(): Promise<設定反映結果> {
    const 保存値 = 保存済みポートを解釈する(this.設定値取得());
    const 結果 =
      保存値 === undefined
        ? await this.割当管理.初回割当する(this.ワークスペース取得())
        : await this.割当管理.既存設定を登録する(
            this.ワークスペース取得(),
            保存値,
          );
    if (結果.種別 === "競合" && 保存値 !== undefined) {
      this.現在ポート = 保存値;
      this.起動禁止理由 = 結果.理由;
    }
    return this.結果を反映する(結果, 保存値 === undefined);
  }

  設定を取得する(): ポート設定 {
    if (this.現在ポート === undefined) {
      throw new Error("固定ポートが確定していません。");
    }
    return ポート設定を解釈する(this.現在ポート);
  }

  保存設定が現在値か(): boolean {
    return (
      保存済みポートを解釈する(this.設定値取得()) === this.現在ポート
    );
  }

  起動禁止理由を取得する(): string | undefined {
    return this.起動禁止理由;
  }

  async 手動変更する(ポート: number): Promise<設定反映結果> {
    ポート設定を解釈する(ポート);
    if (ポート === this.現在ポート) {
      return { 種別: "確定", ポート, 変更あり: false };
    }
    const 結果 = await this.割当管理.手動変更する(
      this.ワークスペース取得(),
      ポート,
    );
    return this.結果を反映する(結果, true);
  }

  async 設定ファイル変更を反映する(): Promise<設定反映結果> {
    const 保存値 = 保存済みポートを解釈する(this.設定値取得());
    if (保存値 === this.現在ポート) {
      return {
        種別: "確定",
        ポート: this.設定を取得する().ポート,
        変更あり: false,
      };
    }

    const 結果 =
      保存値 === undefined
        ? await this.割当管理.初回割当する(this.ワークスペース取得())
        : await this.割当管理.手動変更する(
            this.ワークスペース取得(),
            保存値,
          );
    if (結果.種別 === "競合") {
      if (this.現在ポート !== undefined) {
        await this.設定値保存(this.現在ポート);
      }
      return 結果;
    }
    return this.結果を反映する(結果, 保存値 === undefined);
  }

  private async 結果を反映する(
    結果: ポート割当結果,
    設定保存が必要: boolean,
  ): Promise<設定反映結果> {
    if (結果.種別 === "競合") {
      return 結果;
    }
    const 変更あり = this.現在ポート !== 結果.ポート;
    this.現在ポート = 結果.ポート;
    this.起動禁止理由 = undefined;
    if (設定保存が必要) {
      await this.設定値保存(結果.ポート);
    }
    return {
      種別: "確定",
      ポート: 結果.ポート,
      変更あり,
    };
  }
}
