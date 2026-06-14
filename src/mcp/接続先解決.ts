import {
  環境変数ポートを解釈する,
  旧版既定ポート,
} from "../shared/config";
import {
  インスタンス登録簿,
  対象インスタンスを選択する,
  type 稼働インスタンス情報,
} from "../shared/インスタンス登録簿";

export type MCP接続先 =
  | { 種別: "明示ポート"; ポート: number }
  | {
      種別: "ワークスペース自動選択";
      ポート: number;
      インスタンス: 稼働インスタンス情報;
      対象パス: string;
    }
  | { 種別: "旧版互換"; ポート: number };

type 接続先環境変数 = {
  MEGADENRYU_LSP_MCP_PORT?: string;
  MEGADENRYU_LSP_MCP_WORKSPACE?: string;
  MEGADENRYU_LSP_MCP_REGISTRY_DIR?: string;
};

type 登録簿読み取り = {
  一覧を取得する(): Promise<稼働インスタンス情報[]>;
};

export class 接続先解決エラー extends Error {
  constructor(message: string) {
    super(message);
    this.name = "接続先解決エラー";
  }
}

function 候補を表示する(候補群: 稼働インスタンス情報[]): string {
  if (候補群.length === 0) {
    return "稼働中の VS Code ワークスペースは登録されていません。";
  }
  return 候補群
    .map((候補) => {
      const フォルダ表示 =
        候補.ワークスペースフォルダ群.join(", ") || "フォルダなし";
      return `${候補.ワークスペース名}: port=${候補.ポート}, folders=${フォルダ表示}`;
    })
    .join("\n");
}

export async function MCP接続先を解決する(
  環境変数: 接続先環境変数,
  現在ディレクトリ: string,
  登録簿: 登録簿読み取り = new インスタンス登録簿(),
): Promise<MCP接続先> {
  const 明示ポート = 環境変数ポートを解釈する(
    環境変数.MEGADENRYU_LSP_MCP_PORT,
  );
  if (明示ポート !== undefined) {
    return { 種別: "明示ポート", ポート: 明示ポート };
  }

  const 全インスタンス = await 登録簿.一覧を取得する();
  if (全インスタンス.length === 0) {
    return { 種別: "旧版互換", ポート: 旧版既定ポート };
  }

  const 対象パス =
    環境変数.MEGADENRYU_LSP_MCP_WORKSPACE?.trim() || 現在ディレクトリ;
  const 選択結果 = 対象インスタンスを選択する(
    対象パス,
    全インスタンス,
  );
  switch (選択結果.種別) {
    case "選択済み":
      return {
        種別: "ワークスペース自動選択",
        ポート: 選択結果.インスタンス.ポート,
        インスタンス: 選択結果.インスタンス,
        対象パス,
      };
    case "未検出":
      throw new 接続先解決エラー(
        `対象パスに一致する VS Code ワークスペースがありません: ${対象パス}\n${候補を表示する(選択結果.候補群)}\nMEGADENRYU_LSP_MCP_WORKSPACE で対象ワークスペースを明示できます。`,
      );
    case "複数候補":
      throw new 接続先解決エラー(
        `対象パスに一致する VS Code ワークスペースが複数あります: ${対象パス}\n${候補を表示する(選択結果.候補群)}\n重複して開いているウィンドウを閉じるか、MEGADENRYU_LSP_MCP_PORT で接続先を明示してください。`,
      );
  }
}

export function MCP接続先を表示する(接続先: MCP接続先): string {
  switch (接続先.種別) {
    case "明示ポート":
      return `明示ポート ${接続先.ポート}`;
    case "旧版互換":
      return `旧版拡張向け既定ポート ${接続先.ポート}`;
    case "ワークスペース自動選択":
      return `${接続先.インスタンス.ワークスペース名} (${接続先.対象パス}) port=${接続先.ポート}`;
  }
}
