import { NativeEvent } from "fuickjs";
import { DeviceInfo } from "../types";

export class NetworkService {
  static async getDeviceInfo(): Promise<DeviceInfo> {
    // 必须 async: 在 worker isolate 中 NetworkDiscovery 不在白名单, 同步调用
    // 实际拿到的是 trampoline 转主 isolate 返回的 Promise, 行为完全错误。
    const result = await (globalThis as any).dartCallNativeAsync(
      "NetworkDiscovery.getDeviceInfo",
      {}
    );
    return result as DeviceInfo;
  }

  static async getLocalIp(): Promise<string | null> {
    const result = await (globalThis as any).dartCallNativeAsync(
      "NetworkDiscovery.getLocalIp",
      {}
    );
    return result;
  }

  // MQTT Signaling Methods
  static async connectSignaling(role: 'controller' | 'controlee'): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Signaling.connect", { role });
  }

  static async getDeviceId(): Promise<string> {
    return await (globalThis as any).dartCallNativeAsync("Signaling.getDeviceId", {});
  }

  static async connectToDevice(targetId: string, captureMode: string): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Signaling.connectToDevice", { targetId, captureMode });
  }

  static async disconnectSignaling(): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Signaling.disconnect", {});
  }
}
