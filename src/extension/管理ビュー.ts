import * as vscode from "vscode";
import {
  ポート設定を表示する,
  type ポート設定,
} from "../shared/config";
import { インスタンス登録簿 } from "../shared/インスタンス登録簿";
import { 停止操作を提示すべきか } from "./操作トグル状態";
import type { サーバー管理 } from "./サーバー管理";
import type { サーバー状態 } from "./サーバー状態";

class 管理項目 extends vscode.TreeItem {
  constructor(
    label: string,
    description: string | undefined,
    icon: string,
    readonly 子項目群: 管理項目[] = [],
    command?: vscode.Command,
  ) {
    super(
      label,
      子項目群.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = command;
  }
}

function 状態表示(状態: サーバー状態): {
  label: string;
  description?: string;
  icon: string;
} {
  switch (状態.種別) {
    case "停止中":
      return { label: "停止中", icon: "circle-slash" };
    case "起動中":
      return { label: "起動中", icon: "loading~spin" };
    case "停止処理中":
      return { label: "停止処理中", icon: "loading~spin" };
    case "失敗":
      return { label: "起動失敗", description: 状態.理由, icon: "error" };
    case "稼働中":
      return {
        label: "稼働中",
        description: `port ${状態.実ポート}`,
        icon: "radio-tower",
      };
  }
}

function 起動停止トグル項目を作る(状態: サーバー状態): 管理項目 {
  if (停止操作を提示すべきか(状態)) {
    return new 管理項目("停止", undefined, "debug-stop", [], {
      command: "megadenryuLspMcp.stopServer",
      title: "停止",
    });
  }
  return new 管理項目("起動", undefined, "debug-start", [], {
    command: "megadenryuLspMcp.startServer",
    title: "起動",
  });
}

function ポート設定を状態から得る(状態: サーバー状態): ポート設定 | undefined {
  switch (状態.種別) {
    case "起動中":
    case "失敗":
    case "稼働中":
      return 状態.ポート設定;
    case "停止中":
    case "停止処理中":
      return undefined;
  }
}

export class 管理ビュー
  implements vscode.TreeDataProvider<管理項目>, vscode.Disposable
{
  private readonly 変更通知 = new vscode.EventEmitter<
    管理項目 | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.変更通知.event;
  private readonly 状態購読: vscode.Disposable;
  private readonly 定期更新: NodeJS.Timeout;

  constructor(
    private readonly サーバー: サーバー管理,
    private readonly 設定取得: () => {
      ポート設定: ポート設定;
      自動起動: boolean;
    },
    private readonly ワークスペース名取得: () => string,
    private readonly 登録簿: インスタンス登録簿,
  ) {
    this.状態購読 = this.サーバー.状態変更を購読する(() => this.更新する());
    this.定期更新 = setInterval(() => this.更新する(), 5_000);
  }

  getTreeItem(element: 管理項目): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: 管理項目): Promise<管理項目[]> {
    if (element !== undefined) {
      return element.子項目群;
    }
    const 状態 = this.サーバー.状態を取得する();
    const 設定 = this.設定取得();
    const 状態内容 = 状態表示(状態);
    const 状態ポート設定 = ポート設定を状態から得る(状態);
    const 現在項目群 = [
      new 管理項目(
        状態内容.label,
        状態内容.description,
        状態内容.icon,
        [],
        { command: "megadenryuLspMcp.showStatus", title: "状態を表示" },
      ),
      new 管理項目(
        "ワークスペース",
        this.ワークスペース名取得(),
        "root-folder",
      ),
      new 管理項目(
        "固定ポート",
        ポート設定を表示する(状態ポート設定 ?? 設定.ポート設定),
        "settings-gear",
        [],
        { command: "megadenryuLspMcp.setPort", title: "ポートを変更" },
      ),
      new 管理項目(
        "自動起動",
        設定.自動起動 ? "有効" : "無効",
        設定.自動起動 ? "pass-filled" : "circle-outline",
        [],
        {
          command: "megadenryuLspMcp.toggleAutoStart",
          title: "自動起動を切り替え",
        },
      ),
    ];
    if (状態.種別 === "稼働中") {
      現在項目群.push(
        new 管理項目("実ポート", String(状態.実ポート), "plug"),
        new 管理項目("MCP 接続数", String(状態.接続数), "link"),
        new 管理項目(
          "登録簿",
          状態.登録状態.種別 === "公開失敗"
            ? 状態.登録状態.理由
            : 状態.登録状態.種別,
          状態.登録状態.種別 === "公開失敗" ? "warning" : "database",
        ),
      );
    }

    const 全インスタンス = await this.登録簿.一覧を取得する();
    const インスタンス項目群 = 全インスタンス.map(
      (情報) =>
        new 管理項目(
          情報.ワークスペース名,
          `port ${情報.ポート}`,
          情報.インスタンス識別子 === this.サーバー.インスタンス識別子
            ? "vm-active"
            : "vm",
          情報.ワークスペースフォルダ群.map(
            (フォルダ) => new 管理項目(フォルダ, undefined, "folder"),
          ),
        ),
    );
    const 操作項目群 = [
      起動停止トグル項目を作る(状態),
      new 管理項目("再起動", undefined, "refresh", [], {
        command: "megadenryuLspMcp.restartServer",
        title: "再起動",
      }),
      new 管理項目("MCP 設定をコピー", undefined, "copy", [], {
        command: "megadenryuLspMcp.copyMcpConfiguration",
        title: "MCP 設定をコピー",
      }),
      new 管理項目("固定ポートをコピー", undefined, "clippy", [], {
        command: "megadenryuLspMcp.copyPort",
        title: "固定ポートをコピー",
      }),
      new 管理項目("ログを表示", undefined, "output", [], {
        command: "megadenryuLspMcp.showLog",
        title: "ログを表示",
      }),
    ];
    return [
      new 管理項目(
        "現在の VS Code ウィンドウ",
        undefined,
        "window",
        現在項目群,
      ),
      new 管理項目(
        "稼働中のワークスペース",
        String(インスタンス項目群.length),
        "server-environment",
        インスタンス項目群,
      ),
      new 管理項目("操作", undefined, "tools", 操作項目群),
    ];
  }

  更新する(): void {
    this.変更通知.fire();
  }

  dispose(): void {
    clearInterval(this.定期更新);
    this.状態購読.dispose();
    this.変更通知.dispose();
  }
}
