import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { z } from "zod";
import { ホスト } from "./config";

export const 登録情報版 = 1;
export const 稼働判定時間ミリ秒 = 20_000;

const 稼働インスタンス情報スキーマ = z.object({
  版: z.literal(登録情報版),
  インスタンス識別子: z.string().min(1),
  プロセス識別子: z.number().int().positive(),
  ホスト: z.literal(ホスト),
  ポート: z.number().int().min(1).max(65535),
  ワークスペース名: z.string().min(1),
  ワークスペースファイル: z.string().nullable(),
  ワークスペースフォルダ群: z.array(z.string()),
  拡張バージョン: z.string().min(1),
  起動日時: z.string().datetime(),
  更新日時: z.string().datetime(),
});

export type 稼働インスタンス情報 = z.infer<
  typeof 稼働インスタンス情報スキーマ
>;

export type ワークスペース情報 = Pick<
  稼働インスタンス情報,
  "ワークスペース名" | "ワークスペースファイル" | "ワークスペースフォルダ群"
>;

export type インスタンス選択結果 =
  | { 種別: "選択済み"; インスタンス: 稼働インスタンス情報 }
  | { 種別: "未検出"; 候補群: 稼働インスタンス情報[] }
  | { 種別: "複数候補"; 候補群: 稼働インスタンス情報[] };

export function 登録簿ディレクトリを取得する(
  環境変数値: string | undefined = process.env.MEGADENRYU_LSP_MCP_REGISTRY_DIR,
): string {
  if (環境変数値 !== undefined && 環境変数値.trim() !== "") {
    return resolve(環境変数値);
  }
  return join(homedir(), ".megadenryu-vscode-lsp-mcp", "instances");
}

export function パスを比較用に正規化する(
  対象パス: string,
  実行環境: NodeJS.Platform = process.platform,
): string {
  const 絶対パス = normalize(
    isAbsolute(対象パス) ? 対象パス : resolve(対象パス),
  );
  return 実行環境 === "win32" ? 絶対パス.toLocaleLowerCase() : 絶対パス;
}

function 配下にあるか(対象パス: string, 親パス: string): boolean {
  const 相対パス = relative(親パス, 対象パス);
  return (
    相対パス === "" ||
    (!相対パス.startsWith("..") && !isAbsolute(相対パス))
  );
}

function 一致するフォルダ長を取得する(
  対象パス: string,
  インスタンス: 稼働インスタンス情報,
): number {
  const 正規化対象 = パスを比較用に正規化する(対象パス);
  if (
    インスタンス.ワークスペースファイル !== null &&
    パスを比較用に正規化する(
      インスタンス.ワークスペースファイル,
    ) === 正規化対象
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  const 一致長群 = インスタンス.ワークスペースフォルダ群
    .map((フォルダ) => パスを比較用に正規化する(フォルダ))
    .filter((フォルダ) => 配下にあるか(正規化対象, フォルダ))
    .map((フォルダ) => フォルダ.length);
  return 一致長群.length === 0 ? -1 : Math.max(...一致長群);
}

export function 稼働中か(
  インスタンス: 稼働インスタンス情報,
  現在時刻ミリ秒: number = Date.now(),
): boolean {
  const 更新時刻 = Date.parse(インスタンス.更新日時);
  return (
    Number.isFinite(更新時刻) &&
    現在時刻ミリ秒 - 更新時刻 <= 稼働判定時間ミリ秒
  );
}

export function 対象インスタンスを選択する(
  対象パス: string,
  全インスタンス: 稼働インスタンス情報[],
  現在時刻ミリ秒: number = Date.now(),
): インスタンス選択結果 {
  const 稼働中群 = 全インスタンス.filter((情報) =>
    稼働中か(情報, 現在時刻ミリ秒),
  );
  const 得点付き = 稼働中群
    .map((インスタンス) => ({
      インスタンス,
      一致長: 一致するフォルダ長を取得する(対象パス, インスタンス),
    }))
    .filter((候補) => 候補.一致長 >= 0);

  if (得点付き.length === 0) {
    return { 種別: "未検出", 候補群: 稼働中群 };
  }
  const 最長一致 = Math.max(...得点付き.map((候補) => 候補.一致長));
  const 最適候補群 = 得点付き
    .filter((候補) => 候補.一致長 === 最長一致)
    .map((候補) => 候補.インスタンス);
  return 最適候補群.length === 1
    ? { 種別: "選択済み", インスタンス: 最適候補群[0]! }
    : { 種別: "複数候補", 候補群: 最適候補群 };
}

function 登録ファイルパス(
  登録簿ディレクトリ: string,
  インスタンス識別子: string,
): string {
  return join(登録簿ディレクトリ, `${インスタンス識別子}.json`);
}

export class インスタンス登録簿 {
  constructor(
    private readonly ディレクトリ: string = 登録簿ディレクトリを取得する(),
  ) {}

  async 登録する(情報: 稼働インスタンス情報): Promise<void> {
    await mkdir(this.ディレクトリ, { recursive: true });
    const ファイルパス = 登録ファイルパス(
      this.ディレクトリ,
      情報.インスタンス識別子,
    );
    const 一時ファイルパス = join(
      this.ディレクトリ,
      `.${情報.インスタンス識別子}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(
        一時ファイルパス,
        JSON.stringify(情報, null, 2),
        "utf8",
      );
      await rename(一時ファイルパス, ファイルパス);
    } finally {
      await rm(一時ファイルパス, { force: true });
    }
  }

  async 削除する(インスタンス識別子: string): Promise<void> {
    await rm(
      登録ファイルパス(this.ディレクトリ, インスタンス識別子),
      { force: true },
    );
  }

  async 一覧を取得する(
    現在時刻ミリ秒: number = Date.now(),
  ): Promise<稼働インスタンス情報[]> {
    let ファイル名群: string[];
    try {
      ファイル名群 = await readdir(this.ディレクトリ);
    } catch {
      return [];
    }

    const 結果群: 稼働インスタンス情報[] = [];
    for (const ファイル名 of ファイル名群) {
      if (!ファイル名.endsWith(".json")) {
        continue;
      }
      const ファイルパス = join(this.ディレクトリ, ファイル名);
      try {
        const 生情報: unknown = JSON.parse(
          await readFile(ファイルパス, "utf8"),
        );
        const 解析結果 = 稼働インスタンス情報スキーマ.safeParse(生情報);
        if (!解析結果.success) {
          continue;
        }
        if (!稼働中か(解析結果.data, 現在時刻ミリ秒)) {
          await rm(ファイルパス, { force: true });
          continue;
        }
        結果群.push(解析結果.data);
      } catch {
        continue;
      }
    }
    return 結果群.sort((左, 右) =>
      左.ワークスペース名.localeCompare(右.ワークスペース名, "ja"),
    );
  }
}
