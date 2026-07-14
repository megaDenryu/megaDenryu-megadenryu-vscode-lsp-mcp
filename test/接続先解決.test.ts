import { describe, expect, it } from "vitest";
import {
  MCP接続先を解決する,
  接続先解決エラー,
} from "../src/mcp/接続先解決";

describe("MCP接続先を解決する", () => {
  it("明示ポートを使う", () => {
    const 結果 = MCP接続先を解決する({
      MEGADENRYU_LSP_MCP_PORT: "19000",
    });
    expect(結果).toEqual({ 種別: "明示ポート", ポート: 19000 });
  });

  it("明示ポートがなければ接続先を推定せず拒否する", () => {
    expect(() => MCP接続先を解決する({})).toThrow(接続先解決エラー);
  });
});
