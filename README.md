# megaDenryu VSCode LSP MCP

VS Code が保持している rust-analyzer、TypeScript Language Features などの言語サーバーを、MCP クライアントから操作する拡張です。

## 接続構成

Claude と MCP server の間は stdio、MCP server と VS Code 拡張の間はローカル WebSocket です。

```text
Claude
  └─ stdio
      └─ Node.js MCP server
          └─ ws://127.0.0.1:<ワークスペース固定ポート>
              └─ VS Code 拡張
                  └─ VS Code API / 言語サーバー
```

HTTP MCP serverではありません。ポートは、Node.js MCP server と VS Code 拡張を接続する WebSocket の待受番号です。

## ワークスペース固定ポート

各ワークスペースは一つの固定ポートを持ちます。

1. `megadenryuLspMcp.port` が未設定なら、初回だけ未割当かつ現在未使用の番号を選ぶ。
2. 選んだ番号を VS Code のワークスペース設定へ保存する。
3. 以後は VS Code を再起動しても同じ番号を使う。
4. 保存済み番号が使用中でも別番号へ変更せず、起動失敗として管理画面へ表示する。
5. 利用者が管理画面から番号を変更する場合、他ワークスペースへの割当と現在の使用状況を検査してから保存する。

全ワークスペース共通の割当台帳は、番号の重複割当を防ぐためだけに使用します。MCP server が接続先を推定する用途には使いません。

## Claude側の設定

`.mcp.json` には、VS Code の管理画面に表示された固定ポートを必ず明記します。

```json
{
  "mcpServers": {
    "vscode-lsp-mcp": {
      "command": "node",
      "args": [
        "C:/devs/PokemonBattleAI/submodules/megadenryu-vscode-lsp-mcp/dist/mcp.js"
      ],
      "env": {
        "MEGADENRYU_LSP_MCP_PORT": "17800"
      }
    }
  }
}
```

`MEGADENRYU_LSP_MCP_PORT` がない場合、MCP server は接続先を推定せず起動エラーになります。別のワークスペースでは、そのワークスペースへ割り当てられた別番号を設定してください。

管理画面の `MCP 設定をコピー` から、インストール済み拡張の MCP server パスと固定ポートを含む設定をコピーできます。

## 管理画面

アクティビティバーの `LSP MCP` サイドバーと状態バーから、次の情報と操作を利用できます。

- サーバーの起動、停止、再起動
- ワークスペース固定ポートの表示と変更
- VS Code 起動時の自動起動
- MCP 接続数
- 同時に稼働している VS Code ワークスペース
- `.mcp.json` 用設定のコピー
- 固定ポートのコピー
- 出力ログの表示

ポート競合時は次のように区別して表示します。

- 本拡張の別ワークスペースが使用中: ワークスペース名を表示
- それ以外のプロセスが使用中: 別アプリケーションが使用中と表示
- 共通台帳で別ワークスペースへ割当済み: 設定の保存前に拒否

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

## ビルドとインストール

```pwsh
npm install --prefix submodules/megadenryu-vscode-lsp-mcp
npm run typecheck --prefix submodules/megadenryu-vscode-lsp-mcp
npm test --prefix submodules/megadenryu-vscode-lsp-mcp
npm run build --prefix submodules/megadenryu-vscode-lsp-mcp
npm run package --prefix submodules/megadenryu-vscode-lsp-mcp
code --install-extension submodules/megadenryu-vscode-lsp-mcp/megadenryu-vscode-lsp-mcp-0.3.0.vsix --force
```

インストール後、開いている各 VS Code ウィンドウを再読み込みします。

## 手動疎通確認

```pwsh
node submodules/megadenryu-vscode-lsp-mcp/scripts/ping-check.mjs 17800
```

または `MEGADENRYU_LSP_MCP_PORT` を設定してから実行します。

## ライセンス

MIT
