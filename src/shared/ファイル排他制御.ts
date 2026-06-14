import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

const 不完全ロック期限ミリ秒 = 1_000;
const ロック待機上限ミリ秒 = 5_000;

export function ファイルシステムエラーか(
  エラー: unknown,
  コード: string,
): boolean {
  return (
    エラー instanceof Error &&
    "code" in エラー &&
    エラー.code === コード
  );
}

export class ファイル排他制御 {
  constructor(private readonly ロックパス: string) {}

  async 実行する<T>(処理: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.ロックパス), { recursive: true });
    const 開始時刻 = Date.now();
    while (true) {
      let ロック;
      try {
        ロック = await open(this.ロックパス, "wx");
      } catch (エラー) {
        if (!ファイルシステムエラーか(エラー, "EEXIST")) {
          throw エラー;
        }
        await this.期限切れロックを削除する();
        if (Date.now() - 開始時刻 >= ロック待機上限ミリ秒) {
          throw new Error("固定ポート割当の排他ロックを取得できませんでした。");
        }
        await new Promise((解決) => setTimeout(解決, 50));
        continue;
      }
      try {
        await ロック.writeFile(
          JSON.stringify({ processId: process.pid, time: Date.now() }),
        );
        return await 処理();
      } finally {
        await ロック.close();
        await rm(this.ロックパス, { force: true });
      }
    }
  }

  private async 期限切れロックを削除する(): Promise<void> {
    try {
      const ロック内容: unknown = JSON.parse(
        await readFile(this.ロックパス, "utf8"),
      );
      if (
        typeof ロック内容 === "object" &&
        ロック内容 !== null &&
        "processId" in ロック内容 &&
        typeof ロック内容.processId === "number" &&
        Number.isInteger(ロック内容.processId)
      ) {
        if (this.プロセスが稼働中か(ロック内容.processId)) {
          return;
        }
        await rm(this.ロックパス, { force: true });
        return;
      }
    } catch (エラー) {
      if (ファイルシステムエラーか(エラー, "ENOENT")) {
        return;
      }
    }

    try {
      const 情報 = await stat(this.ロックパス);
      if (Date.now() - 情報.mtimeMs >= 不完全ロック期限ミリ秒) {
        await rm(this.ロックパス, { force: true });
      }
    } catch (エラー) {
      if (!ファイルシステムエラーか(エラー, "ENOENT")) {
        throw エラー;
      }
    }
  }

  private プロセスが稼働中か(プロセス識別子: number): boolean {
    try {
      process.kill(プロセス識別子, 0);
      return true;
    } catch (エラー) {
      if (ファイルシステムエラーか(エラー, "ESRCH")) {
        return false;
      }
      if (ファイルシステムエラーか(エラー, "EPERM")) {
        return true;
      }
      throw エラー;
    }
  }
}
