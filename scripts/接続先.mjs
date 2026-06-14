import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";

const 稼働判定時間ミリ秒 = 20_000;

function 正規化する(対象パス) {
  const 絶対パス = normalize(
    isAbsolute(対象パス) ? 対象パス : resolve(対象パス),
  );
  return process.platform === "win32"
    ? 絶対パス.toLocaleLowerCase()
    : 絶対パス;
}

function 配下にあるか(対象パス, 親パス) {
  const 相対パス = relative(親パス, 対象パス);
  return (
    相対パス === "" ||
    (!相対パス.startsWith("..") && !isAbsolute(相対パス))
  );
}

function 登録簿ディレクトリ() {
  const 指定値 = process.env.MEGADENRYU_LSP_MCP_REGISTRY_DIR;
  return 指定値 && 指定値.trim() !== ""
    ? resolve(指定値)
    : join(homedir(), ".megadenryu-vscode-lsp-mcp", "instances");
}

async function 稼働情報を読む() {
  let ファイル名群;
  try {
    ファイル名群 = await readdir(登録簿ディレクトリ());
  } catch {
    return [];
  }
  const 結果群 = [];
  for (const ファイル名 of ファイル名群) {
    if (!ファイル名.endsWith(".json")) continue;
    try {
      const 情報 = JSON.parse(
        await readFile(join(登録簿ディレクトリ(), ファイル名), "utf8"),
      );
      const 更新時刻 = Date.parse(情報.更新日時);
      if (
        Number.isInteger(情報.ポート) &&
        Array.isArray(情報.ワークスペースフォルダ群) &&
        Date.now() - 更新時刻 <= 稼働判定時間ミリ秒
      ) {
        結果群.push(情報);
      }
    } catch {
      continue;
    }
  }
  return 結果群;
}

export async function 接続URLを解決する(明示ポート) {
  if (明示ポート !== undefined) {
    const ポート = Number(明示ポート);
    if (!Number.isInteger(ポート) || ポート < 1 || ポート > 65535) {
      throw new Error(`ポートが不正です: ${明示ポート}`);
    }
    return `ws://127.0.0.1:${ポート}`;
  }

  const 全情報 = await 稼働情報を読む();
  if (全情報.length === 0) {
    return "ws://127.0.0.1:17800";
  }
  const 対象パス = 正規化する(
    process.env.MEGADENRYU_LSP_MCP_WORKSPACE ?? process.cwd(),
  );
  const 得点付き = 全情報
    .map((情報) => {
      if (
        typeof 情報.ワークスペースファイル === "string" &&
        正規化する(情報.ワークスペースファイル) === 対象パス
      ) {
        return { 情報, 一致長: Number.MAX_SAFE_INTEGER };
      }
      const 一致長群 = 情報.ワークスペースフォルダ群
        .map(正規化する)
        .filter((フォルダ) => 配下にあるか(対象パス, フォルダ))
        .map((フォルダ) => フォルダ.length);
      return {
        情報,
        一致長: 一致長群.length === 0 ? -1 : Math.max(...一致長群),
      };
    })
    .filter((候補) => 候補.一致長 >= 0);
  if (得点付き.length === 0) {
    throw new Error(`対象ワークスペースが見つかりません: ${対象パス}`);
  }
  const 最長一致 = Math.max(...得点付き.map((候補) => 候補.一致長));
  const 候補群 = 得点付き.filter((候補) => 候補.一致長 === 最長一致);
  if (候補群.length !== 1) {
    throw new Error(`対象ワークスペースが複数あります: ${対象パス}`);
  }
  return `ws://127.0.0.1:${候補群[0].情報.ポート}`;
}
