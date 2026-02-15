import { NativeEvent } from "fuickjs";
import { DeviceInfo } from "../types";

export class NetworkService {
  private static deviceListeners: Array<(device: DeviceInfo) => void> = [];

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
}

