import { NativeEvent } from "fuickjs";
import { ControlService } from "./control_service";

export class WebRTCService {
  static async startCall(isCaller: boolean) {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.startCall", { isCaller });
  }

  static async stopCall() {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.stopCall", {});
  }
}
