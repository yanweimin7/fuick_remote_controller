import { NativeEvent } from "fuickjs";
import { ScreenFrame } from "../types";

export class ScreenCaptureService {
  static async startCapture(params: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    frameRate?: number;
  } = {}): Promise<boolean> {
    const result = await (globalThis as any).dartCallNativeAsync("ScreenCapture.startCapture", {
      quality: 90,
      maxWidth: 1920,
      maxHeight: 1080,
      frameRate: 30,
      ...params,
    });
    return result === true;
  }

  static async stopCapture(): Promise<boolean> {
    return await (globalThis as any).dartCallNativeAsync("ScreenCapture.stopCapture", {});
  }

  static onScreenFrame(callback: (frame: ScreenFrame) => void): () => void {
    const handleFrame = (data: any) => {
      if (!data || !data.data) return;

      const frame: ScreenFrame = {
        data: `data:image/jpeg;base64,${data.data}`,
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
