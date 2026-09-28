import { ControlService } from "./control_service";

/** 采集源标识，需与 Dart 侧 MediaSourceType.wireId 一致 */
export type CaptureSource = "screen" | "camera" | "manual";

export interface CameraState {
  facingMode: string;
  torchOn: boolean;
  hasTorch: boolean;
}

export interface StreamStat {
  width?: number;
  height?: number;
  fps?: number;
  bytesReceived?: number;
  packetsLost?: number;
}

export class WebRTCService {
  /**
   * 建立 PeerConnection。
   *
   * @param isCaller true = 控制端(主叫)，false = 受控端(被叫)
   * @param captureMode 受控端采集源；多路用逗号分隔，如 "screen,camera"。
   *                    控制端传 undefined。
   */
  static async startCall(isCaller: boolean, captureMode?: string) {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.startCall", { isCaller, captureMode });
  }

  static async stopCall() {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.stopCall", {});
  }

  static async sendData(data: string) {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.sendControlData", { data });
  }

  /** 前后摄切换。走原生 track.switchCamera()，track id 不变、无需重协商。 */
  static async switchCamera(): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.switchCamera", {});
  }

  static async setTorch(on: boolean): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.setTorch", { on });
  }

  static async getCameraState(): Promise<CameraState> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.getCameraState", {});
  }

  /**
   * 接收端码流统计：streamId → {width,height,fps,bytesReceived,packetsLost}。
   * 取代旧的手动模式截图 FPS 估算。
   */
  static async getStats(): Promise<Record<string, StreamStat>> {
    return await (globalThis as any).dartCallNativeAsync("WebRTC.getStats", {});
  }
}
