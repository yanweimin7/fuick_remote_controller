import React, { useState, useEffect } from "react";
import {
  Column,
  Text,
  Container,
  Row,
  Switch,
  Icon,
  Expanded,
  Scaffold,
  AppBar,
  useNavigator,
  Button,
} from "fuickjs";
import { NetworkService } from "../services/network_service";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";

export default function ControleeHomePage() {
  const navigator = useNavigator();
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [serverPort, setServerPort] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [connectedClient, setConnectedClient] = useState<any>(null);

  useEffect(() => {
    loadDeviceInfo();
    return () => {
      // 清理
      if (isServerRunning) {
        stopServer();
      }
    };
  }, []);

  const loadDeviceInfo = async () => {
    const info = await NetworkService.getDeviceInfo();
    setDeviceInfo(info);
  };

  const startServer = async () => {
    // 启动控制服务器 - 固定端口为 8811
    const result = await ControlService.startServer(8811);

    if (result && result.success) {
      setIsServerRunning(true);
      setServerPort(8811);

      // 重新加载设备信息以获取最新的 IP
      await loadDeviceInfo();

      console.log("[Controlee] Server started");
    } else {
      alert("启动失败: " + (result?.error || "未知错误"));
    }
  };

  const stopServer = async () => {
    await ScreenCaptureService.stopCapture();
    await ControlService.stopServer();
    setIsServerRunning(false);
    setServerPort(0);
  };

  const toggleServer = () => {
    if (isServerRunning) {
      stopServer();
    } else {
      startServer();
    }
  };

  // 监听连接状态
  useEffect(() => {
    const removeListener = ControlService.onClientConnected(async (data) => {
      if (data.status === "connected") {
        setConnectedClient(data.client);
        // 开始屏幕捕获
        // 降低分辨率和质量以提高 FPS
        await ScreenCaptureService.startCapture({
          port: serverPort || 8811,
          quality: 50, // 降低质量
          maxWidth: 720, // 降低分辨率
          maxHeight: 1280,
          frameRate: 30, // 目标帧率
        });
      } else if (data.status === "disconnected") {
        setConnectedClient(null);
        // 停止屏幕捕获
        await ScreenCaptureService.stopCapture();
      }
    });
    return removeListener;
  }, [serverPort]);

  const disconnectClient = async () => {
    await ControlService.disconnect();
    await ScreenCaptureService.stopCapture();
    setConnectedClient(null);
  };


  return (
    <Scaffold
      appBar={
        <AppBar
          title={
            <Column>
              <Text text="被控端" fontSize={20} fontWeight="bold" color="#FFFFFF" />
              {deviceInfo && (
                <Text
                  text={`本机: ${deviceInfo.name}`}
                  fontSize={12}
                  color="#FFFFFF80"
                  margin={{ top: 4 }}
                />
              )}
            </Column>
          }
          backgroundColor="#FF9800"
        />
      }
    >
      <Container color="#F5F5F5">
        <Column>
          {/* 状态卡片 */}
          <Container padding={16}>
            <Container
              padding={20}
              decoration={{
                color: "#FFFFFF",
                borderRadius: 12,
                boxShadow: {
                  color: "#00000010",
                  blurRadius: 8,
                  offset: { dx: 0, dy: 2 },
                },
              }}
            >
              <Row
                mainAxisAlignment="spaceBetween"
                crossAxisAlignment="center"
              >
                <Column>
                  <Text
                    text="屏幕共享服务"
                    fontSize={18}
                    fontWeight="w500"
                    color="#333333"
                  />
                  <Text
                    text={
                      isServerRunning
                        ? `运行中 (端口: ${serverPort})`
                        : "已停止"
                    }
                    fontSize={14}
                    color={isServerRunning ? "#4CAF50" : "#999999"}
                    margin={{ top: 4 }}
                  />
                </Column>
                <Switch value={isServerRunning} onChanged={toggleServer} />
              </Row>
            </Container>
          </Container>

          {/* 说明信息 */}
          <Expanded flex={1}>
            <Container padding={16}>
              <Column>
                {isServerRunning && (
                  <Container
                    margin={{ top: 16 }}
                    padding={24}
                    decoration={{
                      color: "#FFFFFF",
                      borderRadius: 12,
                      boxShadow: {
                        color: "#00000010",
                        blurRadius: 8,
                        offset: { dx: 0, dy: 2 },
                      },
                    }}
                  >
                    <Column crossAxisAlignment="center">
                      <Text
                        text="被控端连接信息"
                        fontSize={16}
                        fontWeight="bold"
                        color="#333333"
                      />
                      <Container
                        margin={{ top: 16 }}
                        padding={{ vertical: 12, horizontal: 24 }}
                        decoration={{
                          color: "#F5F5F5",
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          text={`${deviceInfo?.ip || "正在获取 IP..."}:${serverPort}`}
                          fontSize={24}
                          fontWeight="bold"
                          color="#1976D2"
                        />
                      </Container>
                      <Text
                        text="请在控制端输入上方显示的 IP 和端口"
                        fontSize={12}
                        color="#999999"
                        margin={{ top: 12 }}
                      />
                    </Column>
                  </Container>
                )}

                {/* 已连接的控制端信息 */}
                {connectedClient && (
                  <Container
                    margin={{ top: 16 }}
                    padding={24}
                    decoration={{
                      color: "#FFFFFF",
                      borderRadius: 12,
                      boxShadow: {
                        color: "#00000010",
                        blurRadius: 8,
                        offset: { dx: 0, dy: 2 },
                      },
                    }}
                  >
                    <Column crossAxisAlignment="center">
                      <Row mainAxisAlignment="center" crossAxisAlignment="center">
                        <Icon name="phonelink_setup" size={24} color="#4CAF50" />
                        <Text
                          text="已连接控制端"
                          fontSize={16}
                          fontWeight="bold"
                          color="#333333"
                          margin={{ left: 8 }}
                        />
                      </Row>

                      <Container
                        margin={{ top: 16, bottom: 16 }}
                        padding={{ vertical: 12, horizontal: 24 }}
                        decoration={{
                          color: "#E8F5E9",
                          borderRadius: 8,
                          border: { width: 1, color: "#C8E6C9" },
                        }}
                      >
                        <Column crossAxisAlignment="center">
                          <Text
                            text={connectedClient.name || "远程设备"}
                            fontSize={18}
                            fontWeight="bold"
                            color="#2E7D32"
                          />
                          <Text
                            text={`${connectedClient.address}:${connectedClient.port}`}
                            fontSize={14}
                            color="#666666"
                            margin={{ top: 4 }}
                          />
                        </Column>
                      </Container>

                      <Button
                        text="断开连接"
                        onTap={disconnectClient}
                      />
                    </Column>
                  </Container>
                )}

                <Container
                  margin={{ top: 16 }}
                  padding={16}
                  decoration={{
                    color: "#E3F2FD",
                    borderRadius: 8,
                    border: { width: 1, color: "#BBDEFB" },
                  }}
                >
                  <Row crossAxisAlignment="start">
                    <Icon name="info" size={20} color="#1976D2" />
                    <Expanded flex={1}>
                      <Column margin={{ left: 8 }}>
                        <Text
                          text="使用说明"
                          fontSize={16}
                          fontWeight="w500"
                          color="#1976D2"
                        />
                        <Text
                          text="1. 开启屏幕共享服务后，控制端可以通过 IP 和端口连接"
                          fontSize={14}
                          color="#666666"
                          margin={{ top: 8 }}
                        />
                        <Text
                          text="2. 被控端需要开启无障碍服务权限才能响应远程操作"
                          fontSize={14}
                          color="#666666"
                          margin={{ top: 4 }}
                        />
                        <Text
                          text="3. 确保控制端和被控端在同一 WiFi 网络下"
                          fontSize={14}
                          color="#666666"
                          margin={{ top: 4 }}
                        />
                      </Column>
                    </Expanded>
                  </Row>
                </Container>
              </Column>
            </Container>
          </Expanded>

          {/* 底部提示 */}
          <Container padding={16} alignment="center">
            <Text
              text="FuickJS Remote Control"
              fontSize={12}
              color="#CCCCCC"
            />
          </Container>
        </Column>
      </Container>
    </Scaffold>
  );
}
