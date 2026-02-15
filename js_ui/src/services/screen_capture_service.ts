import { NativeEvent } from "fuickjs";
import { ScreenFrame } from "../types";

export class ScreenCaptureService {
  static async startCapture(params: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    frameRate?: number;
  }): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("ScreenCapture.startCapture", {
      quality: 80,
      maxWidth: 1280,
      maxHeight: 720,
      frameRate: 30,
      ...params,
    });
    return result === true;
  }

  static async stopCapture(): Promise<boolean> {
    const result = await (globalThis as any).dartCallNative("ScreenCapture.stopCapture", {});
    return result === true;
  }

  static onScreenFrame(callback: (frame: ScreenFrame) => void): () => void {
    const handleFrame = (data: any) => {
      if (!data) return;

      const frame: ScreenFrame = {
        data: data.data,
        timestamp: data.timestamp,
        width: data.width,
        height: data.height,
        originalWidth: data.originalWidth,
        originalHeight: data.originalHeight,
      };
      callback(frame);
    };

    NativeEvent.on("screen_frame", handleFrame);

    return () => {
      NativeEvent.off("screen_frame", handleFrame);
    };
  }
}
