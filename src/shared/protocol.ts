// 拡張 ⇔ MCP server 間の WebSocket JSON-RPC プロトコル定義。
// LSP プロトコルそのものではなく、本拡張が公開する高レベル MCP ツールに対応した
// リクエスト/レスポンス型のみを定義する。

export type 位置 = {
  file: string;
  line: number; // 0-origin (LSP 同様)
  character: number; // 0-origin
};

export type テキスト編集 = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
};

export type ファイル編集 = {
  file: string;
  edits: テキスト編集[];
};

export type シンボル情報 = {
  name: string;
  kind: string;
  file: string;
  line: number;
  character: number;
  containerName?: string;
};

export type 参照情報 = {
  file: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
};

// ===== リクエスト型 =====

export type RenameSymbolRequest = {
  method: "renameSymbol";
  params: 位置 & { newName: string; apply: boolean };
};

export type FindSymbolRequest = {
  method: "findSymbol";
  params: { query: string; limit?: number };
};

export type FindReferencingSymbolsRequest = {
  method: "findReferencingSymbols";
  params: 位置 & { includeDeclaration?: boolean };
};

export type PingRequest = { method: "ping"; params: Record<string, never> };

export type GetDiagnosticsRequest = {
  method: "getDiagnostics";
  // file 未指定なら全 workspace の問題を返す。severity / 上限あり。
  params: {
    file?: string;
    severities?: ("error" | "warning" | "info" | "hint")[];
    limit?: number;
  };
};

export type ListCommandsRequest = {
  method: "listCommands";
  // filter は部分文字列。未指定なら全コマンド (数千件あるので limit 推奨)
  params: { filter?: string; limit?: number; includeInternal?: boolean };
};

export type ExecuteCommandRequest = {
  method: "executeCommand";
  params: { commandId: string; args?: unknown[] };
};

export type GetWorkspaceStatusRequest = {
  method: "getWorkspaceStatus";
  params: Record<string, never>;
};

export type SaveAllDirtyRequest = {
  method: "saveAllDirty";
  // includeUntitled=false で名前のない新規バッファは保存対象外 (既定 false)
  params: { includeUntitled?: boolean };
};

export type GetDocumentStateRequest = {
  method: "getDocumentState";
  params: { file: string; includeText?: boolean };
};

export type RenameFileRequest = {
  method: "renameFile";
  // VSCode の WorkspaceEdit.renameFile 経由でファイル名変更。
  // LSP の willRenameFiles participation が起動し、rust-analyzer 等が
  // mod 宣言や use 文を自動更新する仕様。
  // syncPathAttribute=true なら同時に #[path = "old.rs"] も new.rs に書き換える
  params: {
    oldPath: string;
    newPath: string;
    overwrite?: boolean;
    syncPathAttribute?: boolean;
  };
};

export type Request =
  | RenameSymbolRequest
  | FindSymbolRequest
  | FindReferencingSymbolsRequest
  | PingRequest
  | GetDiagnosticsRequest
  | ListCommandsRequest
  | ExecuteCommandRequest
  | GetWorkspaceStatusRequest
  | SaveAllDirtyRequest
  | GetDocumentStateRequest
  | RenameFileRequest;

// ===== レスポンス型 =====

// rename が失敗した・できなかった場合の分類。呼び出し側 (Claude 等) が
// 「位置がズレているのか / LSP が rename 不可なのか」を機械的に判別できる。
export type RenameFailureKind =
  | "positionNotOnIdentifier" // 与えられた位置が識別子の上ではない
  | "providerReturnedNoEdits" // rename provider が呼べたが編集なし
  | "providerError" // rename provider が例外を投げた
  | "applyEditFailed"; // workspace.applyEdit が false を返した

export type 位置補正情報 = {
  // P1.1: 与えられた position が識別子境界外だったので prepareRename の範囲先頭に補正した
  from: { line: number; character: number };
  to: { line: number; character: number };
  reason: string;
};

export type RenameSymbolResult = {
  applied: boolean;
  filesChanged: ファイル編集[];
  totalEditCount: number;
  warnings: string[];
  // P1.1: 位置補正が走った場合のみ非 null
  positionAdjusted: 位置補正情報 | null;
  // P1.2: mod 宣言 rename に伴い #[path = "..."] 属性も同期書き換えした件数
  pathAttributeUpdatesAdded: number;
  // P2.4: applied=false のときの失敗種別
  failureKind: RenameFailureKind | null;
};

export type FindSymbolResult = {
  symbols: シンボル情報[];
};

export type FindReferencingSymbolsResult = {
  references: 参照情報[];
};

export type PingResult = {
  pong: true;
  extensionVersion: string;
  workspaceFolders: string[];
};

export type 診断情報 = {
  file: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  severity: "error" | "warning" | "info" | "hint";
  source?: string; // rustc / rust-analyzer / tsserver 等
  code?: string | number; // E0432 等
  message: string;
};

export type GetDiagnosticsResult = {
  diagnostics: 診断情報[];
  truncated: boolean; // limit に達して打ち切ったか
};

export type ListCommandsResult = {
  commands: string[];
  truncated: boolean;
};

export type ExecuteCommandResult = {
  // VSCode コマンドは任意型を返すので JSON シリアライズ可能な形に丸める
  result: unknown;
  resultType: string; // typeof の文字列 + 配列/null/undefined の区別
};

export type Git変更ファイル = {
  file: string;
  status: string; // "modified" / "added" / "deleted" / "untracked" / "renamed" / "other"
};

export type WorkspaceStatus = {
  dirtyDocuments: { file: string; isUntitled: boolean }[];
  // git extension が取れる場合のみ。拡張未ロード時は null
  git: {
    repositoryRoot: string;
    workingTreeChanges: Git変更ファイル[];
    indexChanges: Git変更ファイル[];
    head: { name?: string; commit?: string } | null;
  } | null;
  // 問題件数 (重要度別)
  problemCounts: { error: number; warning: number; info: number; hint: number };
};

export type SaveAllDirtyResult = {
  savedCount: number;
  // saveAll が一括 boolean を返すだけなので、内訳は事前/事後の dirty 差で計算
  savedFiles: string[];
};

export type DocumentState = {
  file: string;
  exists: boolean;
  isDirty: boolean;
  isUntitled: boolean;
  lineCount: number;
  text: string | null; // includeText=false なら null
};

export type RenameFileResult = {
  applied: boolean;
  // 事前/事後 dirty 比較で「LSP participation が走って書き換えたファイル」を観測
  observedSideEffects: {
    dirtyAfter: string[]; // 事後に dirty 化したファイル一覧 (= LSP が変更した可能性高)
    fileExistsNow: { oldPath: boolean; newPath: boolean }; // rename が成功したか
  };
  pathAttributeUpdatesAdded: number; // syncPathAttribute=true で追加注入した数
  warnings: string[];
};

export type ResultMap = {
  renameSymbol: RenameSymbolResult;
  findSymbol: FindSymbolResult;
  findReferencingSymbols: FindReferencingSymbolsResult;
  ping: PingResult;
  getDiagnostics: GetDiagnosticsResult;
  listCommands: ListCommandsResult;
  executeCommand: ExecuteCommandResult;
  getWorkspaceStatus: WorkspaceStatus;
  saveAllDirty: SaveAllDirtyResult;
  getDocumentState: DocumentState;
  renameFile: RenameFileResult;
};

// ===== JSON-RPC 風エンベロープ =====

export type RpcRequest<R extends Request = Request> = {
  jsonrpc: "2.0";
  id: string;
  method: R["method"];
  params: R["params"];
};

export type RpcSuccess<M extends Request["method"]> = {
  jsonrpc: "2.0";
  id: string;
  result: ResultMap[M];
};

export type RpcError = {
  jsonrpc: "2.0";
  id: string;
  error: { code: number; message: string; data?: unknown };
};

export type RpcResponse = RpcSuccess<Request["method"]> | RpcError;

export const プロトコルバージョン = "0.1.0";
