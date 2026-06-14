import { WebSocketServer, type WebSocket } from "ws";
import { ホスト } from "../shared/config";

export function WebSocket待受を開始する(
  待受ポート: number,
  接続受付: (接続: WebSocket) => void,
  ログ: (message: string) => void,
): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const サーバー = new WebSocketServer({
      host: ホスト,
      port: 待受ポート,
    });
    const 起動前エラー = (error: Error) => {
      reject(error);
    };
    サーバー.once("error", 起動前エラー);
    サーバー.once("listening", () => {
      サーバー.off("error", 起動前エラー);
      サーバー.on("error", (error) => {
        ログ(`WebSocket server エラー: ${error.message}`);
      });
      サーバー.on("connection", 接続受付);
      resolve(サーバー);
    });
  });
}

export function 実ポートを取得する(サーバー: WebSocketServer): number {
  const アドレス = サーバー.address();
  if (アドレス === null || typeof アドレス === "string") {
    throw new Error("WebSocket server の実ポートを取得できませんでした。");
  }
  return アドレス.port;
}
