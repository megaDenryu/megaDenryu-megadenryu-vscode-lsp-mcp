import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  ファイルシステムエラーか,
  ファイル排他制御,
} from "./ファイル排他制御";
import {
  パスを比較用に正規化する,
  type ワークスペース情報,
} from "./インスタンス登録簿";

const 割当開始ポート = 17800;
const 割当終了ポート = 19799;

const 割当情報スキーマ = z.object({
  ワークスペース識別子: z.string().min(1),
  ワークスペース名: z.string().min(1),
  ポート: z.number().int().min(1).max(65535),
  更新日時: z.string().datetime(),
});

const 割当台帳スキーマ = z.object({
  版: z.literal(1),
  割当群: z.array(割当情報スキーマ),
});

type 割当台帳 = z.infer<typeof 割当台帳スキーマ>;
type ポート使用検査 = (ポート: number) => Promise<boolean>;

export type ポート割当結果 =
  | { 種別: "確定"; ポート: number; 新規割当: boolean }
  | { 種別: "競合"; 理由: string };

export function 割当台帳パスを取得する(
  環境変数値: string | undefined = process.env
    .MEGADENRYU_LSP_MCP_ASSIGNMENT_FILE,
): string {
  return 環境変数値?.trim()
    ? resolve(環境変数値)
    : join(homedir(), ".megadenryu-vscode-lsp-mcp", "port-assignments.json");
}

export function ワークスペース識別子を作る(
  情報: ワークスペース情報,
): string {
  if (情報.ワークスペースファイル !== null) {
    return `file:${パスを比較用に正規化する(情報.ワークスペースファイル)}`;
  }
  const フォルダ群 = 情報.ワークスペースフォルダ群
    .map((フォルダ) => パスを比較用に正規化する(フォルダ))
    .sort();
  if (フォルダ群.length === 0) {
    throw new Error("ワークスペースが開かれていません。");
  }
  return `folders:${JSON.stringify(フォルダ群)}`;
}

export class 固定ポート割当 {
  private readonly 排他制御: ファイル排他制御;

  constructor(
    private readonly 台帳パス: string = 割当台帳パスを取得する(),
    private readonly ポートが使用中か: ポート使用検査,
  ) {
    this.排他制御 = new ファイル排他制御(`${台帳パス}.lock`);
  }

  async 初回割当する(
    ワークスペース: ワークスペース情報,
  ): Promise<ポート割当結果> {
    return this.排他制御.実行する(async () => {
      const 台帳 = await this.台帳を読む();
      const 識別子 = ワークスペース識別子を作る(ワークスペース);
      const 既存 = 台帳.割当群.find(
        (割当) => 割当.ワークスペース識別子 === 識別子,
      );
      if (既存 !== undefined) {
        return { 種別: "確定", ポート: 既存.ポート, 新規割当: false };
      }

      const 割当済み = new Set(台帳.割当群.map((割当) => 割当.ポート));
      for (
        let ポート = 割当開始ポート;
        ポート <= 割当終了ポート;
        ポート += 1
      ) {
        if (割当済み.has(ポート) || (await this.ポートが使用中か(ポート))) {
          continue;
        }
        await this.割当を保存する(台帳, ワークスペース, ポート);
        return { 種別: "確定", ポート, 新規割当: true };
      }
      return {
        種別: "競合",
        理由: `${割当開始ポート} から ${割当終了ポート} に割り当て可能なポートがありません。`,
      };
    });
  }

  async 既存設定を登録する(
    ワークスペース: ワークスペース情報,
    ポート: number,
  ): Promise<ポート割当結果> {
    return this.排他制御.実行する(async () => {
      const 台帳 = await this.台帳を読む();
      const 競合 = this.他ワークスペース割当を探す(
        台帳,
        ワークスペース,
        ポート,
      );
      if (競合 !== undefined) {
        return { 種別: "競合", 理由: this.割当競合理由(競合) };
      }
      await this.割当を保存する(台帳, ワークスペース, ポート);
      return { 種別: "確定", ポート, 新規割当: false };
    });
  }

  async 手動変更する(
    ワークスペース: ワークスペース情報,
    ポート: number,
  ): Promise<ポート割当結果> {
    return this.排他制御.実行する(async () => {
      const 台帳 = await this.台帳を読む();
      const 競合 = this.他ワークスペース割当を探す(
        台帳,
        ワークスペース,
        ポート,
      );
      if (競合 !== undefined) {
        return { 種別: "競合", 理由: this.割当競合理由(競合) };
      }
      if (await this.ポートが使用中か(ポート)) {
        return {
          種別: "競合",
          理由: `ポート ${ポート} は現在ほかのプロセスが使用しています。`,
        };
      }
      await this.割当を保存する(台帳, ワークスペース, ポート);
      return { 種別: "確定", ポート, 新規割当: false };
    });
  }

  private 他ワークスペース割当を探す(
    台帳: 割当台帳,
    ワークスペース: ワークスペース情報,
    ポート: number,
  ) {
    const 識別子 = ワークスペース識別子を作る(ワークスペース);
    return 台帳.割当群.find(
      (割当) =>
        割当.ポート === ポート &&
        割当.ワークスペース識別子 !== 識別子,
    );
  }

  private 割当競合理由(
    競合: z.infer<typeof 割当情報スキーマ>,
  ): string {
    return `ポート ${競合.ポート} はワークスペース「${競合.ワークスペース名}」に割り当て済みです。`;
  }

  private async 割当を保存する(
    台帳: 割当台帳,
    ワークスペース: ワークスペース情報,
    ポート: number,
  ): Promise<void> {
    const 識別子 = ワークスペース識別子を作る(ワークスペース);
    const 次の割当 = {
      ワークスペース識別子: 識別子,
      ワークスペース名: ワークスペース.ワークスペース名,
      ポート,
      更新日時: new Date().toISOString(),
    };
    const 次の台帳: 割当台帳 = {
      版: 1,
      割当群: [
        ...台帳.割当群.filter(
          (割当) => 割当.ワークスペース識別子 !== 識別子,
        ),
        次の割当,
      ],
    };
    await this.台帳を書く(次の台帳);
  }

  private async 台帳を読む(): Promise<割当台帳> {
    try {
      const 生データ: unknown = JSON.parse(
        await readFile(this.台帳パス, "utf8"),
      );
      return 割当台帳スキーマ.parse(生データ);
    } catch (エラー) {
      if (ファイルシステムエラーか(エラー, "ENOENT")) {
        return { 版: 1, 割当群: [] };
      }
      throw エラー;
    }
  }

  private async 台帳を書く(台帳: 割当台帳): Promise<void> {
    await mkdir(dirname(this.台帳パス), { recursive: true });
    const 一時パス = `${this.台帳パス}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(一時パス, JSON.stringify(台帳, null, 2), "utf8");
      await rename(一時パス, this.台帳パス);
    } finally {
      await rm(一時パス, { force: true });
    }
  }

}
