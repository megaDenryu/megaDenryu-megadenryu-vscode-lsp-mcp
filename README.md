# megaDenryu VSCode LSP MCP

VSCode 拡張内に MCP server を立ち上げ、VSCode が抱える LSP (rust-analyzer / tsserver 等) を Claude Code 等の MCP クライアントから操作可能にする。

## なぜ自作か

`Serena` ベースの LSP MCP は本プロジェクト規模の Rust workspace で cross-crate rename を完遂できなかった。VSCode 内の rust-analyzer インスタンスをそのまま再利用する設計にすれば真因 (Serena 独自起動の rust-analyzer が cross-crate を解決できない) を回避できる。詳細は親リポジトリの `doc/開発スレッド_2026-05-25_W-203_VSCode_LSP_MCP_自作.md` を参照。

## アーキテクチャ

```
[Claude Code] <--stdio MCP--> [MCP server (Node)]
                                       |
                                       | WebSocket (ws://127.0.0.1:17800)
                                       v
                       [VSCode 拡張 (本拡張)]
                                       |
                                       | VSCode 内部 API
                                       v
                       [rust-analyzer / tsserver / 他 LSP]
```

- **VSCode 拡張** (`dist/extension.js`) — `onStartupFinished` で activate し WebSocket server を起動。MCP server からの JSON-RPC を `vscode.executeDocumentRenameProvider` などに橋渡しする。
- **MCP server** (`dist/mcp.js`) — stdio で Claude Code に接続、WebSocket で拡張を呼ぶ。Node 単体プロセス、`node ./dist/mcp.js` で起動。

両方とも **Vite library mode** (CJS) でビルドする。

## 提供 MCP ツール (MVP)

| ツール名 | 役割 | 内部 VSCode API |
|---|---|---|
| `rename_symbol` | シンボルを rename し、cross-file / cross-crate の全参照を更新 | `vscode.executeDocumentRenameProvider` + `workspace.applyEdit` |
| `find_symbol` | workspace 内シンボル名検索 | `vscode.executeWorkspaceSymbolProvider` |
| `find_referencing_symbols` | 指定位置のシンボルの参照箇所列挙 | `vscode.executeReferenceProvider` |
| `ping` | 接続疎通確認 | (なし) |

## セットアップ手順

### 1. 依存インストール + ビルド

```pwsh
cd submodules/megadenryu-vscode-lsp-mcp
npm install
npm run build
```

`dist/extension.js` と `dist/mcp.js` が生成される。

### 2. VSCode 拡張のインストール (.vsix)

```pwsh
npm run package
code --install-extension megadenryu-vscode-lsp-mcp-0.1.0.vsix
```

VSCode を再起動し、コマンドパレットで `megaDenryu LSP MCP: 状態を表示` が出ればインストール成功。「稼働中 (ws://127.0.0.1:17800, 接続数=0)」と表示される。

### 3. MCP server を Claude Code に登録

```pwsh
claude mcp add vscode-lsp-mcp -- node "C:/devs/PokemonBattleAI/submodules/megadenryu-vscode-lsp-mcp/dist/mcp.js"
```

または `.mcp.json` (本リポジトリ直下) に追記:

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

### 4. 動作確認

Claude Code から以下を呼ぶ:

```
mcp__vscode-lsp-mcp__ping  →  { pong: true, ... } が返れば OK
```

## 設定 (VSCode の settings.json)

```json
{
  "megadenryuLspMcp.port": 17800,
  "megadenryuLspMcp.autoStart": true
}
```

MCP server 側のポート上書きは環境変数 `MEGADENRYU_LSP_MCP_PORT` で。

## 開発時の流れ

```pwsh
npm run build:watch   # ファイル変更で自動再ビルド
npm run typecheck     # tsc --noEmit
npm test              # vitest (純粋関数のユニットテストのみ)
```

VSCode 拡張のデバッグ実行は `F5` (Extension Development Host)。本拡張プロジェクトのみを VSCode で開いてから F5。

## 既知の制約

- **ポート 17800 が使用中だと起動失敗。** 設定で別ポートに変えれば回避可。
- **複数 VSCode ウィンドウ同時起動時**、最初に起動した方が listen し、後発はポート bind 失敗する。後発側からは前者の拡張が応答する形になる (workspace が異なれば結果も異なるので注意)。
- **rename 対象シンボルが LSP で rename 不可な場合** (例: 外部 crate のシンボル、proc macro 内識別子等) は `applied: false` + warnings が返る。

## ライセンス

MIT。
