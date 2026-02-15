import { NativeEvent } from "fuickjs";

export class ControlService {
  static async startServer(port: number = 0): Promise<{ success: boolean; port: number; error?: string }> {
    const result = await (globalThis as any).dartCallNative("Control.startServer", { port });
    return result;
  }

  static async stopServer(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.stopServer", {});
    return result === true;
  }

  static async connectToDevice(ip: string, port: number): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.connect", {
      ip,
      port,
    });
    return result === true;
  }

  static async disconnect(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.disconnect", {});
    return result === true;
  }

  static async isConnected(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.isConnected", {});
    return result === true;
  }

  static async sendClick(x: number, y: number): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.sendClick", {
      x,
      y,
    });
    return result === true;
  }

  static async sendSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 300
  ): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.sendSwipe", {
      startX,
      startY,
      endX,
      endY,
      duration,
    });
    return result === true;
  }

  static async sendBack(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.sendBack", {});
    return result === true;
  }

  static async sendHome(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.sendHome", {});
    return result === true;
  }

  static async sendRecent(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("Control.sendRecent", {});
    return result === true;
  }

  static onConnectionStateChange(
    callback: (state: "connected" | "disconnected", data?: any) => void
  ): () => void {
    const handleConnected = (data: any) => callback("connected", data);
    const handleDisconnected = () => callback("disconnected");

    NativeEvent.on("connected", handleConnected);
    NativeEvent.on("disconnected", handleDisconnected);

    return () => {
      NativeEvent.off("connected", handleConnected);
      NativeEvent.off("disconnected", handleDisconnected);
    };
  }

  static onClientConnected(callback: (data: any) => void): () => void {
    const handleConnect = (data: any) => callback(data);
    NativeEvent.on("onClientConnected", handleConnect);
    return () => {
      NativeEvent.off("onClientConnected", handleConnect);
    };
  }
}
