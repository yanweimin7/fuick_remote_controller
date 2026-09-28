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
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";
import { WebRTCService } from "../services/webrtc_service";

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

/** 采集源选项。value 需与 Dart 侧 MediaSourceType.wireId 一致 */
const SOURCE_OPTIONS = [
  { value: "screen", label: "屏幕", icon: "screen_share" },
  { value: "camera", label: "摄像头", icon: "videocam" },
  { value: "screen,camera", label: "双画面", icon: "picture_in_picture_alt" },
  { value: "manual", label: "兼容", icon: "image" },
];

export default function AnyLinkHomePage() {
  const navigator = useNavigator();
  const [targetId, setTargetId] = useState("");
  const [myId, setMyId] = useState("加载中...");
  const [status, setStatus] = useState("初始化中...");
  const [isConnecting, setIsConnecting] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  // 'screen' | 'camera' | 'screen,camera' | 'manual'
  const [captureMode, setCaptureMode] = useState("screen");

  useEffect(() => {
    // Initialize Signaling
    initSignaling();

    // Load history
    loadHistory();

    // Listen for incoming connections (Acting as Controlee)
    const removeClientListener = ControlService.onClientConnected(
      async (data) => {
        if (data.status === "connected") {
          setRemoteConnected(true);
          setStatus("远程控制已连接");

          // 采集已由 Dart 侧 CaptureCoordinator 启动：
          // WebRTC 模式无需在此操作；manual 模式才走旧的 MediaProjection 截图通道。
          if (!data.captureMode || data.captureMode === "manual") {
            try {
              await new Promise((resolve) => setTimeout(resolve, 500));

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
      },
    );

    // Cleanup
    return () => {
      removeClientListener();
      NetworkService.disconnectSignaling();
    };
  }, []);

  const initSignaling = async () => {
    setStatus("正在连接云端...");
    // 设备 ID 是本地身份（也是本机 MQTT topic 的名字），与云端连通性无关。
    // 必须先取：若挂在 connectSignaling 成功之后，broker 不可达时 ID 会永远
    // 停在"加载中..."，用户既拿不到要分享的 ID，也看不出是网络问题。
    try {
      const id = await NetworkService.getDeviceId();
      if (id) setMyId(id);
    } catch (e) {
      console.error("getDeviceId failed:", e);
    }

    const connected = await NetworkService.connectSignaling("controller");
    if (connected) {
      setStatus("准备连接");
    } else {
      // ID 仍可分享/抄录，只是暂时无法被连接
      setStatus("云端不可用，暂无法被连接");
    }
  };

  const loadHistory = async () => {
    const lastId = (globalThis as any).localStorage.getItem("lastTargetId");
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
    (globalThis as any).localStorage.setItem("lastTargetId", targetId);

    try {
      const success = await NetworkService.connectToDevice(
        targetId,
        captureMode,
      );

      if (success) {
        // Navigate to Control Page immediately
        navigator.push("/controller/control", {
          device: {
            ip: "P2P",
            name: `设备 ${targetId}`,
            id: targetId,
          },
          captureMode: captureMode,
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
    await WebRTCService.stopCall();
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

          <Text
            text="共享内容"
            fontSize={13}
            fontWeight="bold"
            color={Colors.textSecondary}
            margin={{ bottom: 10 }}
          />

          {/* 采集源选择：多路共享时控制端会自动渲染为多个画面 */}
          <Row mainAxisAlignment="spaceBetween" margin={{ bottom: 20 }}>
            {SOURCE_OPTIONS.map((option) => {
              const selected = captureMode === option.value;
              return (
                <GestureDetector
                  key={option.value}
                  onTap={() => setCaptureMode(option.value)}
                >
                  <Container
                    width={78}
                    padding={{ vertical: 12 }}
                    decoration={{
                      color: selected ? Colors.primary : "#F1F5F9",
                      borderRadius: 10,
                      border: {
                        width: 1,
                        color: selected ? Colors.primary : Colors.divider,
                      },
                    }}
                    alignment="center"
                  >
                    <Icon
                      name={option.icon}
                      size={22}
                      color={selected ? "#FFFFFF" : Colors.textSecondary}
                    />
                    <Text
                      text={option.label}
                      fontSize={12}
                      fontWeight="bold"
                      color={selected ? "#FFFFFF" : Colors.textSecondary}
                      margin={{ top: 6 }}
                    />
                  </Container>
                </GestureDetector>
              );
            })}
          </Row>

          <Container
            decoration={{
              color: "#F1F5F9",
              borderRadius: 12,
              border: { width: 1, color: Colors.divider },
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

          <GestureDetector onTap={isConnecting ? () => {} : handleConnect}>
            <Container
              height={56}
              decoration={{
                color: isConnecting ? Colors.secondary : Colors.primary,
                borderRadius: 12,
                boxShadow: {
                  color: isConnecting ? "transparent" : "#2563EB4D",
                  offset: { dx: 0, dy: 4 },
                  blurRadius: 8,
                },
              }}
              alignment="center"
            >
              {isConnecting ? (
                <Row mainAxisAlignment="center">
                  <SizedBox width={20} height={20}>
                    <CircularProgressIndicator color="#FFFFFF" />
                  </SizedBox>
                  <SizedBox width={12} />
                  <Text
                    text="连接中..."
                    color="#FFFFFF"
                    fontSize={16}
                    fontWeight="bold"
                  />
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
                color: status.includes("失败") || status.includes("错误")
                  ? Colors.error
                  : status === "准备连接" || status === "就绪"
                    ? Colors.success
                    : Colors.secondary,
                borderRadius: 4,
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

        {remoteConnected && (
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
                },
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
        )}
      </Column>
    </Scaffold>
  );
}
