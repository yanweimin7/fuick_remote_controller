import { NativeEvent } from "fuickjs";
import { ControlService } from "./control_service";

export class WebRTCService {
  static async startCall(isCaller: boolean) {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.startCall", { isCaller });
  }

  static async stopCall() {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.stopCall", {});
  }

  static async createOfferToken(): Promise<string> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.createOfferToken", {});
  }

  static async createAnswerToken(offerToken: string): Promise<string> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.createAnswerToken", { offerToken });
  }

  static async completeConnection(answerToken: string): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.completeConnection", { answerToken });
  }
}
