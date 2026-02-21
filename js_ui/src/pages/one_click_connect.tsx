import React, { useState, useEffect } from "react";
import {
  Column,
  Container,
  Text,
  TextField,
  useNavigator,
  Scaffold,
  AppBar,
  GestureDetector,
  Stack,
  Positioned,
  SizedBox,
  CircularProgressIndicator,
  Row,
  Icon,
  Image,
} from "fuickjs";
import { NetworkService } from "../services/network_service";
import { StorageService } from "../services/storage_service";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";

// Define a nice color palette
const Colors = {
  primary: "#2563EB", // Royal Blue
  primaryDark: "#1E40AF",
  secondary: "#64748B", // Slate
  background: "#F8FAFC", // Light Gray/Blue
  surface: "#FFFFFF",
  textPrimary: "#1E293B",
  textSecondary: "#64748B",
  success: "#10B981",
  error: "#EF4444",
  divider: "#E2E8F0",
};

export default function AnyLinkHomePage() {
  const navigator = useNavigator();
  const [targetId, setTargetId] = useState("");
  const [myId, setMyId] = useState("加载中...");
  const [status, setStatus] = useState("初始化中...");
  const [isConnecting, setIsConnecting] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [captureMode, setCaptureMode] = useState("webrtc");

  useEffect(() => {
    // Initialize Signaling
    initSignaling();

    // Load history
    loadHistory();

    // Listen for incoming connections (Acting as Controlee)
    const removeClientListener = ControlService.onClientConnected(async (data) => {
      if (data.status === "connected") {
        setRemoteConnected(true);
        setStatus("远程控制已连接");

        // Auto start screen capture
        if (data.captureMode === 'webrtc') {
          console.log("WebRTC Capture Mode active. Skipping manual capture.");
        } else {
          try {
            // Add a small delay to ensure UI is ready and connection is stable
            await new Promise(resolve => setTimeout(resolve, 500));

            await ScreenCaptureService.startCapture({
              quality: 40,
              maxWidth: 720,
              maxHeight: 1280,
              frameRate: 20,
            });
          } catch (e) {
            console.error("Failed to start screen capture:", e);
            setStatus("启动录屏失败");
          }
        }
      } else if (data.status === "disconnected") {
        setRemoteConnected(false);
        setStatus("准备连接");
      }
    });

    // Cleanup
    return () => {
      removeClientListener();
      NetworkService.disconnectSignaling();
    };
  }, []);

  const initSignaling = async () => {
    setStatus("正在连接云端...");
    // Connect as 'controller' but this allows both roles via topic subscription
    const connected = await NetworkService.connectSignaling('controller');
    if (connected) {
      const id = await NetworkService.getDeviceId();
      setMyId(id);
      setStatus("准备连接");
    } else {
      setStatus("网络错误");
    }
  };

  const loadHistory = async () => {
    const lastId = await StorageService.getString("lastTargetId");
    if (lastId) {
      setTargetId(lastId);
    }
  };

  const handleConnect = async () => {
    if (!targetId || targetId.length < 6) {
      setStatus("ID 无效");
      return;
    }

    setIsConnecting(true);
    setStatus(`正在连接到 ${targetId}...`);

    // Save ID
    await StorageService.setString("lastTargetId", targetId);

    try {
      const success = await NetworkService.connectToDevice(targetId, captureMode);

      if (success) {
        // Navigate to Control Page immediately
        navigator.push("/controller/control", {
          device: {
            ip: "P2P",
            name: `设备 ${targetId}`,
            id: targetId,
          },
          captureMode: captureMode
        });
        setIsConnecting(false);
        setStatus("就绪");
      } else {
        setStatus("连接请求失败");
        setIsConnecting(false);
      }
    } catch (e) {
      console.error("Connect error:", e);
      setStatus("连接错误");
      setIsConnecting(false);
    }
  };

  const handleStopSharing = async () => {
    await ControlService.disconnect();
    setRemoteConnected(false);
    setStatus("准备连接");
  };

  return (
    <Scaffold
      backgroundColor={Colors.background}
      appBar={
        <AppBar
          title="AnyLink"
          centerTitle={true}
          backgroundColor={Colors.primary}
          elevation={0}
          actions={[
            <GestureDetector onTap={() => setCaptureMode(captureMode === "webrtc" ? "manual" : "webrtc")}>
              <Container padding={16}>
                <Row>
                  <Text
                    text={captureMode === "webrtc" ? "标准模式" : "兼容模式"}
                    color="#FFFFFF"
                    fontSize={14}
                    fontWeight="bold"
                    margin={{ right: 8 }}
                  />

                </Row>
              </Container>
            </GestureDetector>
          ]}
        />
      }
    >

      <Column padding={20} crossAxisAlignment="stretch">
        <Container
          padding={24}
          decoration={{
            color: Colors.surface,
            borderRadius: 16,
            boxShadow: {
              color: "#0000000D", // Very light shadow
              offset: { dx: 0, dy: 4 },
              blurRadius: 12,
            },
          }}
          margin={{ bottom: 24 }}
        >
          <Row mainAxisAlignment="spaceBetween" crossAxisAlignment="center">
            <Column crossAxisAlignment="start">
              <Text
                text="您的 ID"
                fontSize={14}
                fontWeight="bold"
                color={Colors.textSecondary}
                margin={{ bottom: 4 }}
              />
              <Text
                text={myId}
                fontSize={32}
                fontWeight="w900" // Extra bold
                color={Colors.textPrimary}
              />
            </Column>

            <GestureDetector onTap={() => ControlService.copyToClipboard(myId)}>
              <Container
                padding={12}
                decoration={{
                  color: "#F1F5F9",
                  borderRadius: 12,
                }}
              >
                <Icon name="content_copy" size={24} color={Colors.primary} />
              </Container>
            </GestureDetector>
          </Row>

          <Container
            margin={{ top: 16 }}
            padding={{ vertical: 8, horizontal: 12 }}
            decoration={{
              color: "#EFF6FF",
              borderRadius: 8,
            }}
          >
            <Row>
              <Icon name="info_outline" size={16} color={Colors.primary} />
              <SizedBox width={8} />
              <Text
                text="分享此 ID 以允许远程访问。"
                fontSize={12}
                color={Colors.primaryDark}
              />
            </Row>
          </Container>
        </Container>

        {/* Connect to Remote Section */}
        <Container
          padding={24}
          decoration={{
            color: Colors.surface,
            borderRadius: 16,
            boxShadow: {
              color: "#0000000D",
              offset: { dx: 0, dy: 4 },
              blurRadius: 12,
            },
          }}
        >
          <Text
            text="控制远程设备"
            fontSize={18}
            fontWeight="bold"
            color={Colors.textPrimary}
            margin={{ bottom: 20 }}
          />

          <Container
            decoration={{
              color: "#F1F5F9",
              borderRadius: 12,
              border: { width: 1, color: Colors.divider }
            }}
            padding={{ horizontal: 16, vertical: 4 }}
            margin={{ bottom: 20 }}
          >
            <TextField
              text={targetId}
              hintText="输入伙伴 ID"
              onChanged={setTargetId}
              keyboardType="number"
              maxLines={1}
            />
          </Container>

          <GestureDetector onTap={isConnecting ? () => { } : handleConnect}>
            <Container
              height={56}
              decoration={{
                color: isConnecting ? Colors.secondary : Colors.primary,
                borderRadius: 12,
                boxShadow: {
                  color: isConnecting ? "transparent" : "#2563EB4D",
                  offset: { dx: 0, dy: 4 },
                  blurRadius: 8,
                }
              }}
              alignment="center"
            >
              {isConnecting ? (
                <Row mainAxisAlignment="center">
                  <SizedBox width={20} height={20}>
                    <CircularProgressIndicator color="#FFFFFF" />
                  </SizedBox>
                  <SizedBox width={12} />
                  <Text text="连接中..." color="#FFFFFF" fontSize={16} fontWeight="bold" />
                </Row>
              ) : (
                <Text
                  text="连接"
                  color="#FFFFFF"
                  fontSize={18}
                  fontWeight="bold"
                />
              )}
            </Container>
          </GestureDetector>
        </Container>

        {/* Status Bar */}
        <Container alignment="center" margin={{ top: 32 }}>
          <Row mainAxisAlignment="center">
            <Container
              width={8}
              height={8}
              decoration={{
                color: status.includes("Ready") ? Colors.success : (status.includes("Error") ? Colors.error : Colors.secondary),
                borderRadius: 4
              }}
              margin={{ right: 8 }}
            />
            <Text text={status} color={Colors.textSecondary} fontSize={14} />
          </Row>
        </Container>

        {/* Footer Version */}
        <Container alignment="center" margin={{ top: 20 }}>
          <Text text="v1.0.0" color="#CBD5E1" fontSize={12} />
        </Container>

        {remoteConnected &&
          <GestureDetector onTap={handleStopSharing}>
            <Container
              padding={{ horizontal: 32, vertical: 16 }}
              decoration={{
                color: Colors.error,
                borderRadius: 30,
                boxShadow: {
                  color: "#EF444466",
                  offset: { dx: 0, dy: 4 },
                  blurRadius: 12,
                }
              }}
            >
              <Row>
                <Icon name="stop_circle" size={24} color="#FFFFFF" />
                <SizedBox width={12} />
                <Text
                  text="停止共享"
                  color="#FFFFFF"
                  fontSize={18}
                  fontWeight="bold"
                />
              </Row>
            </Container>
          </GestureDetector>
        }
      </Column>



    </Scaffold>
  );
}
