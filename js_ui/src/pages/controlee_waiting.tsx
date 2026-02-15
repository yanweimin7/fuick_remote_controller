import React, { useEffect } from "react";
import {
  Column,
  Text,
  Container,
  Button,
  CircularProgressIndicator,
  Scaffold,
  AppBar,
  useNavigator,
  Icon,
} from "fuickjs";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";

interface ControleeWaitingPageProps {
  deviceName?: string;
}

export default function ControleeWaitingPage(props: ControleeWaitingPageProps) {
  const { deviceName } = props;
  const navigator = useNavigator();

  useEffect(() => {
    // 监听连接状态
    const unsubscribeState = ControlService.onConnectionStateChange(
      (state, data) => {
        if (state === "disconnected") {
          navigator.pop();
        }
      }
    );

    return () => {
      unsubscribeState();
      // 页面卸载时不停止服务，以便其他客户端连接
      // ScreenCaptureService.stopCapture();
      // ControlService.stopServer();
    };
  }, []);

  return (
    <Scaffold
      appBar={
        <AppBar
          title={<Text text="正在被控制" fontSize={20} fontWeight="bold" color="#FFFFFF" />}
          backgroundColor="#FF9800"
        />
      }
    >
      <Container color="#F5F5F5">
        {/* 连接状态 */}
        <Column
          mainAxisAlignment="center"
          crossAxisAlignment="center"
          padding={32}
        >
          <Icon name="phonelink_setup" size={64} color="#4CAF50" />
          <Text
            text="控制端已连接"
            fontSize={18}
            fontWeight="w500"
            color="#333333"
            margin={{ top: 24 }}
          />
          <Text
            text={`控制端: ${deviceName || "远程设备"}`}
            fontSize={14}
            color="#666666"
            margin={{ top: 8 }}
          />
          <Container
            margin={{ top: 32 }}
            padding={16}
            decoration={{
              color: "#E8F5E9",
              borderRadius: 8,
              border: { width: 1, color: "#C8E6C9" },
            }}
          >
            <Text
              text="正在实时传输屏幕画面..."
              fontSize={14}
              color="#2E7D32"
            />
          </Container>
          <Text
            text="请保持此页面打开以维持连接"
            fontSize={12}
            color="#999999"
            margin={{ top: 16 }}
          />
        </Column>

        {/* 底部按钮 */}
        <Container padding={16}>
          <Button
            text="断开连接"
            onTap={() => {
              ControlService.disconnect();
              navigator.pop();
            }}
          />
        </Container>
      </Container>
    </Scaffold>
  );
}
