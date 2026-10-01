import React, { useState, useEffect, useRef } from "react";
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
  DialogService,
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

  // 被控端：等待用户确认的授权请求
  const [pendingRequest, setPendingRequest] = useState<{
    sourceId?: string;
    captureMode?: string;
  } | null>(null);
  // 被控端：正在控制本机的设备 ID，用于顶部标识
  const [controlledBy, setControlledBy] = useState<string | null>(null);
  // 弹框是否已展示。用 ref 而非 state：连点/重复 offer 时 state 还没提交，
  // 用 ref 才能立刻把后续请求挡掉，避免弹框叠着弹框。
  const dialogShownRef = useRef(false);

  /** 请求来源的采集模式名，用于让用户知道对方要看什么 */
  const requestModeLabel = (mode?: string): string => {
    if (!mode || mode === "manual") return "屏幕画面";
    if (mode === "camera") return "摄像头";
    if (mode === "screen,camera") return "屏幕与摄像头";
    return "屏幕画面";
  };

  useEffect(() => {
    // Initialize Signaling
    initSignaling();

    // Load history
    loadHistory();

    // Listen for incoming connections (Acting as Controlee)
    const removeClientListener = ControlService.onClientConnected(
      async (data) => {
        console.log("[controlee] onClientConnected", JSON.stringify(data));
        if (data.status === "connected") {
          setRemoteConnected(true);
          setControlledBy(data?.client?.deviceId ?? null);
          setStatus("正在被远程控制");

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
          setControlledBy(null);
          setStatus("准备连接");
        }
      },
    );

    // 被控端：收到控制请求 → 弹框询问用户
    const removeRequestListener = ControlService.onControlRequest((data) => {
      if (dialogShownRef.current) {
        console.log("[controlee] 弹框已在展示，忽略重复请求", data);
        return;
      }
      setPendingRequest(data);
    });

    // 主叫端：被拒
    const removeRejectedListener = ControlService.onControlRejected(() => {
      setIsConnecting(false);
      setStatus("对方拒绝了连接请求");
    });

    // Cleanup
    return () => {
      removeClientListener();
      removeRequestListener();
      removeRejectedListener();
      NetworkService.disconnectSignaling();
    };
  }, []);

  // 弹框由 pendingRequest 驱动，单独一个 effect 处理异步交互。
  // 不能塞进上面的初始化 effect：那里的 cleanup 会在 state 变化时重跑，
  // 正在 await 的 showModal 会被取消。
  useEffect(() => {
    if (!pendingRequest) return;

    let cancelled = false;

    (async () => {
      dialogShownRef.current = true;
      try {
        const allow = await DialogService.showModal({
          title: "远程控制请求",
          content: `设备 ${pendingRequest.sourceId ?? "未知"} 请求控制本机，`
            + `将共享${requestModeLabel(pendingRequest.captureMode)}。是否允许？`,
          showCancel: true,
          cancelText: "拒绝",
          confirmText: "允许",
        });
        if (cancelled) return;
        await ControlService.respondControlRequest(allow === true);
      } catch (e) {
        console.error("respondControlRequest failed:", e);
      } finally {
        dialogShownRef.current = false;
        if (!cancelled) {
          setPendingRequest(null);
          // 先回"准备连接"：拒绝即定局；允许则等 onClientConnected 切被控态
          setStatus("准备连接");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingRequest]);

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
        {/* 被控中 / 待确认：放在内容最顶部，保证一进页面就能看到。
            不用全屏遮罩是因为本机此时正被远程操控，遮罩会挡住用户的返回键区域，
            也无法区分是自己要操作还是对方在点。 */}
        {remoteConnected ? (
          <Container
            margin={{ bottom: 16 }}
            padding={16}
            decoration={{
              color: "#FEF2F2",
              borderRadius: 14,
              border: { width: 2, color: Colors.error },
            }}
          >
            <Row crossAxisAlignment="center">
              <Container
                padding={8}
                decoration={{
                  color: Colors.error,
                  borderRadius: 20,
                }}
              >
                <Icon name="visibility" size={20} color="#FFFFFF" />
              </Container>
              <SizedBox width={12} />
              <Column crossAxisAlignment="start">
                <Text
                  text="正在被远程控制"
                  fontSize={17}
                  fontWeight="bold"
                  color="#991B1B"
                />
                <Text
                  text={
                    controlledBy
                      ? `控制端设备 ID：${controlledBy}`
                      : "对方正在查看并操作本机"
                  }
                  fontSize={12}
                  color="#B91C1C"
                  margin={{ top: 2 }}
                />
              </Column>
            </Row>
            <GestureDetector
              onTap={async () => {
                try {
                  await WebRTCService.stopCall();
                } finally {
                  setRemoteConnected(false);
                  setControlledBy(null);
                  setStatus("准备连接");
                }
              }}
            >
              <Container
                margin={{ top: 14 }}
                padding={{ vertical: 11 }}
                alignment="center"
                decoration={{
                  color: Colors.error,
                  borderRadius: 10,
                }}
              >
                <Text
                  text="结束控制"
                  fontSize={15}
                  fontWeight="bold"
                  color="#FFFFFF"
                />
              </Container>
            </GestureDetector>
          </Container>
        ) : pendingRequest ? (
          <Container
            margin={{ bottom: 16 }}
            padding={16}
            decoration={{
              color: "#FFFBEB",
              borderRadius: 14,
              border: { width: 2, color: "#F59E0B" },
            }}
          >
            <Row crossAxisAlignment="center">
              <SizedBox width={20} height={20}>
                <CircularProgressIndicator color="#D97706" />
              </SizedBox>
              <SizedBox width={12} />
              <Column crossAxisAlignment="start">
                <Text
                  text="等待你的确认"
                  fontSize={15}
                  fontWeight="bold"
                  color="#92400E"
                />
                <Text
                  text={`设备 ${pendingRequest.sourceId ?? "未知"} 正在请求控制本机`}
                  fontSize={12}
                  color="#B45309"
                  margin={{ top: 2 }}
                />
              </Column>
            </Row>
          </Container>
        ) : null}

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
