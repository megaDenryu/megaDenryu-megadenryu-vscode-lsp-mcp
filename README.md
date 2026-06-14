# megaDenryu VSCode LSP MCP

VS Code が保持している rust-analyzer、TypeScript Language Features などの言語サーバーを、MCP クライアントから操作する拡張です。

## 複数ワークスペース

各 VS Code ウィンドウは独立した WebSocket サーバーを起動します。既定設定では OS が空きポートを割り当てるため、複数のワークスペースを同時に開いてもポート競合しません。

```
[MCP client A] <--stdio--> [MCP server A] <--WebSocket--> [VS Code: Workspace A]
[MCP client B] <--stdio--> [MCP server B] <--WebSocket--> [VS Code: Workspace B]
```

各拡張インスタンスは、ワークスペースのパスと実ポートを利用者ディレクトリの登録簿へ公開します。MCP server は次の順で接続先を決めます。

1. `MEGADENRYU_LSP_MCP_PORT` があれば、その固定ポートを使う。
2. `MEGADENRYU_LSP_MCP_WORKSPACE` があれば、そのパスを含む VS Code ワークスペースを選ぶ。
3. 未指定なら MCP server の現在ディレクトリを含むワークスペースを選ぶ。
4. 一致するウィンドウが複数ある場合は、候補を表示して接続を拒否する。
5. 登録情報が一件もない場合だけ、旧版拡張との互換のため `17800` へ接続する。

## 管理 UI

アクティビティバーの `LSP MCP` から専用サイドバーを開けます。状態バーにも現在の実ポートが表示されます。

管理できる項目:

- サーバーの起動、停止、再起動
- 自動割り当てと固定ポートの切り替え
- VS Code 起動時の自動起動
- 現在の実ポートと MCP 接続数
- 登録簿への公開状態
- 同時に稼働している全 VS Code ワークスペース
- `MEGADENRYU_LSP_MCP_WORKSPACE` 用の設定断片コピー
- 実ポートのコピー
- 出力ログの表示

## 提供する MCP ツール

| ツール | 役割 |
|---|---|
| `rename_symbol` | シンボルの名前変更と全参照更新 |
| `rename_file` | LSP の `workspace/willRenameFiles` を伴うファイル名変更 |
| `find_symbol` | ワークスペース内のシンボル検索 |
| `find_referencing_symbols` | 参照箇所の列挙 |
| `get_diagnostics` | 問題一覧の取得 |
| `list_commands` | VS Code コマンドの一覧 |
| `execute_command` | VS Code コマンドの実行 |
| `get_workspace_status` | 未保存文書、git 変更、問題件数の取得 |
| `save_all_dirty` | 未保存文書の保存 |
| `get_document_state` | 文書の状態と内容の取得 |
| `ping` | 接続先ワークスペースの確認 |

## セットアップ

### 1. ビルドと VSIX 作成

```pwsh
npm install --prefix submodules/megadenryu-vscode-lsp-mcp
npm run build --prefix submodules/megadenryu-vscode-lsp-mcp
npm run package --prefix submodules/megadenryu-vscode-lsp-mcp
```

### 2. 拡張のインストール

```pwsh
code --install-extension submodules/megadenryu-vscode-lsp-mcp/megadenryu-vscode-lsp-mcp-0.2.0.vsix --force
```

インストール後、開いている各 VS Code ウィンドウを再読み込みします。`LSP MCP` サイドバーで、それぞれ異なる実ポートが表示されれば複数ワークスペース対応が有効です。

### 3. MCP server の登録

リポジトリの `.mcp.json` から起動する場合:

```json
{
  "mcpServers": {
    "vscode-lsp-mcp": {
      "command": "node",
      "args": ["./submodules/megadenryu-vscode-lsp-mcp/dist/mcp.js"]
    }
  }
}
```

通常は環境変数の指定は不要です。MCP クライアントがリポジトリ直下で server を起動すれば、現在ディレクトリから対象 VS Code ウィンドウが選ばれます。

別の場所から起動する場合:

```json
{
  "env": {
    "MEGADENRYU_LSP_MCP_WORKSPACE": "C:/devs/PokemonBattleAI"
  }
}
```

固定ポートへ直接接続する場合:

```json
{
  "env": {
    "MEGADENRYU_LSP_MCP_PORT": "17801"
  }
}
```

## VS Code 設定

```json
{
  "megadenryuLspMcp.port": 0,
  "megadenryuLspMcp.autoStart": true
}
```

- `port: 0`: ウィンドウごとに空きポートを自動割り当てする既定設定。
- `port: 1..65535`: ワークスペース設定として固定ポートを使う。
- `autoStart: true`: VS Code ウィンドウ起動時に server を起動する。

固定ポートを使う場合、別のウィンドウと同じ番号を設定すると後から起動した方が `EADDRINUSE` で失敗します。サイドバーから別の番号へ変更して再起動してください。

## 動作確認

```pwsh
node submodules/megadenryu-vscode-lsp-mcp/scripts/ping-check.mjs
```

現在ディレクトリに対応する VS Code ウィンドウへ接続し、ワークスペースフォルダを含む `pong` 応答を表示します。特定ポートを確認する場合は末尾に番号を渡せます。

## 開発

```pwsh
npm run typecheck --prefix submodules/megadenryu-vscode-lsp-mcp
npm test --prefix submodules/megadenryu-vscode-lsp-mcp
npm run build --prefix submodules/megadenryu-vscode-lsp-mcp
```

検証では、自動ポートの複数同時起動、登録簿による選択、固定ポート競合、実 WebSocket の RPC 応答を確認します。

## 問題の切り分け

- サイドバーが `停止中`: `起動` を実行する。
- `起動失敗` と表示される: 項目の理由と出力ログを確認する。
- 登録簿が `公開失敗`: 利用者ディレクトリの `.megadenryu-vscode-lsp-mcp/instances` へ書き込めるか確認する。
- MCP server が複数候補を報告する: 同じワークスペースを重複して開いているウィンドウを閉じるか、固定ポートを明示する。
- MCP server が対象を見つけられない: `MEGADENRYU_LSP_MCP_WORKSPACE` に対象ルートを指定する。
- `rename_symbol` が編集なしを返す: 対象位置、言語サーバーの起動状態、対象シンボルが名前変更可能かを確認する。

## ライセンス

MIT
