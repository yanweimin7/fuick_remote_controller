import { NativeEvent } from "fuickjs";
import { ControlService } from "./control_service";

export class WebRTCService {
  static async startCall(isCaller: boolean, captureMode?: string) {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.startCall", { isCaller, captureMode });
  }

  static async stopCall() {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.stopCall", {});
  }
}
