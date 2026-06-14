import type { ポート設定 } from "../shared/config";
import type { 登録状態 } from "./インスタンス公開";

export type サーバー状態 =
  | { 種別: "停止中" }
  | { 種別: "起動中"; ポート設定: ポート設定 }
  | {
      種別: "稼働中";
      ポート設定: ポート設定;
      実ポート: number;
      接続数: number;
      起動日時: string;
      登録状態: 登録状態;
    }
  | { 種別: "停止処理中" }
  | { 種別: "失敗"; 理由: string; ポート設定: ポート設定 };

export type 拡張設定 = {
  ポート設定: ポート設定;
  自動起動: boolean;
};
