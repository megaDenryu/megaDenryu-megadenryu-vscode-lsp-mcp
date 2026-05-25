// セッション 6: 診断 / コマンド / バッジ系プリミティブのハンドラ群。
// vscode API への薄い橋渡し + git extension API の型ガード。
// 純粋ロジック (severity 変換等) は別関数に切り出して将来テスト可能にしておく。

import * as vscode from "vscode";
import type {
  DocumentState,
  ExecuteCommandRequest,
  ExecuteCommandResult,
  GetDiagnosticsRequest,
  GetDiagnosticsResult,
  GetDocumentStateRequest,
  Git変更ファイル,
  ListCommandsRequest,
  ListCommandsResult,
  SaveAllDirtyRequest,
  SaveAllDirtyResult,
  WorkspaceStatus,
  診断情報,
} from "../shared/protocol";

// ===== 純粋関数 (vscode 依存なし、test 容易) =====

const severityラベル = {
  [vscode.DiagnosticSeverity.Error]: "error" as const,
  [vscode.DiagnosticSeverity.Warning]: "warning" as const,
  [vscode.DiagnosticSeverity.Information]: "info" as const,
  [vscode.DiagnosticSeverity.Hint]: "hint" as const,
};

export function severityを文字列化(s: vscode.DiagnosticSeverity): 診断情報["severity"] {
  return severityラベル[s] ?? "info";
}

// ===== get_diagnostics =====

export async function getDiagnosticsを処理(
  params: GetDiagnosticsRequest["params"],
): Promise<GetDiagnosticsResult> {
  const limit = params.limit ?? 500;
  const 対象severities = new Set(params.severities ?? ["error", "warning", "info", "hint"]);

  const 全件: [vscode.Uri, vscode.Diagnostic[]][] = params.file
    ? [[vscode.Uri.file(params.file), vscode.languages.getDiagnostics(vscode.Uri.file(params.file))]]
    : vscode.languages.getDiagnostics();

  const 出力: 診断情報[] = [];
  let truncated = false;
  for (const [uri, diags] of 全件) {
    for (const d of diags) {
      const severity = severityを文字列化(d.severity);
      if (!対象severities.has(severity)) continue;
      if (出力.length >= limit) {
        truncated = true;
        break;
      }
      出力.push({
        file: uri.fsPath,
        line: d.range.start.line,
        character: d.range.start.character,
        endLine: d.range.end.line,
        endCharacter: d.range.end.character,
        severity,
        ...(typeof d.source === "string" ? { source: d.source } : {}),
        ...(d.code !== undefined && (typeof d.code === "string" || typeof d.code === "number")
          ? { code: d.code }
          : typeof d.code === "object" && d.code !== null && "value" in d.code
            ? { code: (d.code as { value: string | number }).value }
            : {}),
        message: d.message,
      });
    }
    if (truncated) break;
  }
  return { diagnostics: 出力, truncated };
}

// ===== list_commands =====

export async function listCommandsを処理(
  params: ListCommandsRequest["params"],
): Promise<ListCommandsResult> {
  const limit = params.limit ?? 1000;
  const all = await vscode.commands.getCommands(!params.includeInternal);
  const filtered = params.filter
    ? all.filter((c) => c.toLowerCase().includes(params.filter!.toLowerCase()))
    : all;
  const sliced = filtered.slice(0, limit);
  return { commands: sliced, truncated: filtered.length > sliced.length };
}

// ===== execute_command =====

export async function executeCommandを処理(
  params: ExecuteCommandRequest["params"],
): Promise<ExecuteCommandResult> {
  const args = params.args ?? [];
  const result = await vscode.commands.executeCommand(params.commandId, ...args);
  return {
    result: JSONシリアライズ可能化(result),
    resultType: 型名(result),
  };
}

function 型名(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function JSONシリアライズ可能化(v: unknown): unknown {
  // vscode.Uri / vscode.Range / vscode.Position 等は JSON.stringify で
  // toJSON が定義されているが、念のため try/catch で string にする。
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return String(v);
  }
}

// ===== get_workspace_status =====

export async function getWorkspaceStatusを処理(): Promise<WorkspaceStatus> {
  const dirtyDocuments = vscode.workspace.textDocuments
    .filter((d) => d.isDirty)
    .map((d) => ({
      file: d.uri.fsPath,
      isUntitled: d.isUntitled,
    }));

  const problemCounts = { error: 0, warning: 0, info: 0, hint: 0 };
  for (const [, diags] of vscode.languages.getDiagnostics()) {
    for (const d of diags) {
      const s = severityを文字列化(d.severity);
      problemCounts[s] += 1;
    }
  }

  const git = await git情報を取得する();

  return { dirtyDocuments, git, problemCounts };
}

async function git情報を取得する(): Promise<WorkspaceStatus["git"]> {
  const ext = vscode.extensions.getExtension("vscode.git");
  if (!ext) return null;
  try {
    const api = (await ext.activate()).getAPI?.(1);
    if (!api || !Array.isArray(api.repositories) || api.repositories.length === 0) {
      return null;
    }
    // 複数 repo がある場合は workspace folder と一致する最初のを使う。
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const repo = wsRoot
      ? api.repositories.find(
          (r: unknown) => 型ガード_repo(r) && r.rootUri.fsPath === wsRoot,
        ) ?? api.repositories[0]
      : api.repositories[0];

    if (!型ガード_repo(repo)) return null;

    return {
      repositoryRoot: repo.rootUri.fsPath,
      workingTreeChanges: repo.state.workingTreeChanges.map(変更を変換),
      indexChanges: repo.state.indexChanges.map(変更を変換),
      head: repo.state.HEAD
        ? {
            ...(repo.state.HEAD.name ? { name: repo.state.HEAD.name } : {}),
            ...(repo.state.HEAD.commit ? { commit: repo.state.HEAD.commit } : {}),
          }
        : null,
    };
  } catch {
    return null;
  }
}

// vscode.git API は any なので型ガードで絞る
type Repo型 = {
  rootUri: vscode.Uri;
  state: {
    workingTreeChanges: 変更項目[];
    indexChanges: 変更項目[];
    HEAD?: { name?: string; commit?: string } | null;
  };
};
type 変更項目 = { uri: vscode.Uri; status: number };

function 型ガード_repo(v: unknown): v is Repo型 {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.rootUri === "object" &&
    r.rootUri !== null &&
    "fsPath" in (r.rootUri as object) &&
    typeof r.state === "object" &&
    r.state !== null &&
    Array.isArray((r.state as Record<string, unknown>).workingTreeChanges) &&
    Array.isArray((r.state as Record<string, unknown>).indexChanges)
  );
}

// vscode.git の Status enum (一部抜粋、フル定義は extension に依存)
const status名 = (n: number): Git変更ファイル["status"] => {
  // 0=INDEX_MODIFIED 1=INDEX_ADDED 2=INDEX_DELETED 3=INDEX_RENAMED 4=INDEX_COPIED
  // 5=MODIFIED 6=DELETED 7=UNTRACKED 8=IGNORED 9=INTENT_TO_ADD 10=ADDED_BY_US ...
  switch (n) {
    case 0:
    case 5:
      return "modified";
    case 1:
    case 9:
      return "added";
    case 2:
    case 6:
      return "deleted";
    case 3:
      return "renamed";
    case 7:
      return "untracked";
    default:
      return "other";
  }
};

function 変更を変換(c: 変更項目): Git変更ファイル {
  return { file: c.uri.fsPath, status: status名(c.status) };
}

// ===== save_all_dirty =====

export async function saveAllDirtyを処理(
  params: SaveAllDirtyRequest["params"],
): Promise<SaveAllDirtyResult> {
  const 事前 = vscode.workspace.textDocuments
    .filter((d) => d.isDirty && (params.includeUntitled || !d.isUntitled))
    .map((d) => d.uri.fsPath);
  await vscode.workspace.saveAll(params.includeUntitled ?? false);
  const 事後 = new Set(
    vscode.workspace.textDocuments.filter((d) => d.isDirty).map((d) => d.uri.fsPath),
  );
  const savedFiles = 事前.filter((f) => !事後.has(f));
  return { savedCount: savedFiles.length, savedFiles };
}

// ===== get_document_state =====

export async function getDocumentStateを処理(
  params: GetDocumentStateRequest["params"],
): Promise<DocumentState> {
  const uri = vscode.Uri.file(params.file);
  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(uri);
  } catch {
    return {
      file: params.file,
      exists: false,
      isDirty: false,
      isUntitled: false,
      lineCount: 0,
      text: null,
    };
  }
  return {
    file: doc.uri.fsPath,
    exists: true,
    isDirty: doc.isDirty,
    isUntitled: doc.isUntitled,
    lineCount: doc.lineCount,
    text: params.includeText ? doc.getText() : null,
  };
}
