import { NativeEvent } from "fuickjs";
import { DeviceInfo } from "../types";

export class NetworkService {
  static async getDeviceInfo(): Promise<DeviceInfo> {
    const result = await (globalThis as any).dartCallNative(
      "NetworkDiscovery.getDeviceInfo",
      {}
    );
    return result as DeviceInfo;
  }

  static async getLocalIp(): Promise<string | null> {
    const result = await (globalThis as any).dartCallNative(
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

  static async connectToDevice(targetId: string): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Signaling.connectToDevice", { targetId });
  }

  static async disconnectSignaling(): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("Signaling.disconnect", {});
  }
}
