import { createServer } from "node:net";
import { ホスト } from "../shared/config";

export function ポートが使用中か(ポート: number): Promise<boolean> {
  return new Promise((解決, 拒否) => {
    const 検査用サーバー = createServer();
    検査用サーバー.once("error", (エラー) => {
      if ("code" in エラー && エラー.code === "EADDRINUSE") {
        解決(true);
        return;
      }
      拒否(エラー);
    });
    検査用サーバー.once("listening", () => {
      検査用サーバー.close((エラー) => {
        if (エラー !== undefined) {
          拒否(エラー);
          return;
        }
        解決(false);
      });
    });
    検査用サーバー.listen(ポート, ホスト);
  });
}
