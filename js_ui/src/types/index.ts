export interface DeviceInfo {
  name: string;
  ip: string;
  port: number;
  type?: string;
  id?: string;
}

export interface ScreenFrame {
  data: string; // base64 encoded image
  timestamp: number;
  width?: number;
  height?: number;
}

export interface ControlCommand {
  action: 'click' | 'swipe' | 'longPress' | 'key' | 'text';
  params: Record<string, any>;
}

export interface ConnectionConfig {
  ip: string;
  port: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  frameRate?: number;
}
