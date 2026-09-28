import React, { useState, useEffect, useRef } from "react";
import {
  Column,
  Text,
  Container,
  Button,
  Row,
  Icon,
  GestureDetector,
  Image,
  CircularProgressIndicator,
  Scaffold,
  AppBar,
  SizedBox,
  Expanded,
  Stack,
  Positioned,
  useNavigator,
  PointerListener,
  ClipRRect,
} from "fuickjs";
import { VisibilityDetector } from "@fuickjs-community/visibility_detector";
import { NetworkService } from "../services/network_service";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";
import { WebRTCService } from "../services/webrtc_service";
import { DeviceInfo, ScreenFrame } from "../types";

// Custom WebRTC Video View Component
const RTCVideoView = (props: any) => React.createElement("RTCVideoView", props);

interface ControllerControlPageProps {
  device?: DeviceInfo;
  captureMode?: string;
}

const MANUAL_MODES = ["manual", undefined, ""];

/** 摄像头画面默认镜像（前置），屏幕不镜像 */
const isCamera = (id: string) => id === "camera";

interface VideoStageProps {
  activePrimary: string;
  secondaryIds: string[];
  onSelectPrimary: (id: string) => void;
}

/**
 * 视频区独立成 memo 组件。
 *
 * RTCVideoView 是裸宿主元素，fuickjs 运行时重渲染时不做就地复用，会把原生
 * 视图整个重建 —— 日志表现为每秒一次 `setVideoTrack(null)` 后重新 set，
 * 重建间隙 Surface 为空，表现为画面每秒闪一下黑屏。
 *
 * FPS 每秒更新一次，若与视频区同处一个组件就会持续触发重建。抽出来加
 * memo 后，FPS 变化不再波及视频区。
 */
const VideoStage = React.memo(
  ({ activePrimary, secondaryIds, onSelectPrimary }: VideoStageProps) => (
    <Stack>
      <RTCVideoView
        objectFit="contain"
        mirror={isCamera(activePrimary)}
        streamId={activePrimary}
      />
      {/* 副画面 PiP：点击切换为主画面 */}
      {secondaryIds.map((id) => (
        <Positioned key={id} right={12} top={12} width={96} height={160}>
          <GestureDetector onTap={() => onSelectPrimary(id)}>
            {/* fuickjs 的 Container 不支持 overflow，BoxDecoration 也没有
                clip 字段；圆角裁剪要用 ClipRRect，否则 PiP 会溢出圆角。 */}
            <ClipRRect borderRadius={8} clipBehavior="antiAlias">
              <Container
                decoration={{
                  border: { width: 2, color: "#FFFFFF66" },
                  borderRadius: 8,
                }}
              >
                <RTCVideoView
                  objectFit="cover"
                  mirror={isCamera(id)}
                  streamId={id}
                />
              </Container>
            </ClipRRect>
          </GestureDetector>
        </Positioned>
      ))}
    </Stack>
  ),
  (prev, next) =>
    prev.activePrimary === next.activePrimary &&
    prev.secondaryIds.length === next.secondaryIds.length &&
    prev.secondaryIds.every((id, i) => id === next.secondaryIds[i]) &&
    prev.onSelectPrimary === next.onSelectPrimary,
);

VideoStage.displayName = "VideoStage";

interface FpsBadgeProps {
  enabled: boolean;
  manual?: boolean;
}

/**
 * FPS 显示做成独立叶子组件，自带 state 与轮询。
 *
 * fuickjs 的 _FuickNodeWidget 用 `ValueKey(node.id)` 作 key，页面每次重渲染
 * 都会给节点换新 id，于是整棵子树被销毁重建 —— RTCVideoView 的原生视图随之
 * 重建，间隙 Surface 为空，表现为每秒闪一次黑屏。
 *
 * 把每秒变化的 FPS 收进本组件后，页面本身不再每秒重渲染，视频区保持稳定。
 */
const FpsBadge = ({ enabled, manual }: FpsBadgeProps) => {
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastTime = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    // 手动模式：统计截图帧到达速率
    if (manual) {
      const unsubscribe = ScreenCaptureService.onScreenFrame(() => {
        frameCount.current++;
        const now = Date.now();
        if (now - lastTime.current >= 1000) {
          setFps(frameCount.current);
          frameCount.current = 0;
          lastTime.current = now;
        }
      });
      return unsubscribe;
    }
    // WebRTC 模式：真实码流统计
    const timer = setInterval(async () => {
      try {
        const stats = await WebRTCService.getStats();
        const values = Object.values(stats);
        if (values.length === 0) return;
        setFps(values.reduce((sum, s) => sum + (s.fps ?? 0), 0));
      } catch (e) {
        // 连接未建立时会失败，忽略
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, manual]);

  if (!enabled) return null;
  return <Text text={`FPS: ${fps}`} color="#00FF00" fontSize={12} />;
};

FpsBadge.displayName = "FpsBadge";

export default function ControllerControlPage(props: ControllerControlPageProps) {
  const { device, captureMode } = props;
  // manual = 旧截图通道；其余走 WebRTC 实时流
  const isManual = MANUAL_MODES.includes(captureMode as any);
  const isWebRTC = !isManual;
  const navigator = useNavigator();
  const [error, setError] = useState<string | null>(null);
  const [screenImage, setScreenImage] = useState<string | null>(null);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [originalScreenSize, setOriginalScreenSize] = useState({ width: 0, height: 0 });
  const [localSize, setLocalSize] = useState({ width: 0, height: 0 });
  const [showControls, setShowControls] = useState(true);

  // WebRTC 模式下已就绪的远端流；空数组表示尚未收到
  const [streamIds, setStreamIds] = useState<string[]>([]);
  // 主画面（点击缩略图可切换），其余作为 PiP 小窗
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  const touchStartPos = useRef({ x: 0, y: 0 });
  const viewRef = useRef<any>(null);

  // 主画面默认取第一路；小窗 = 其余
  const activePrimary = primaryId && streamIds.includes(primaryId) ? primaryId : streamIds[0] ?? null;
  const secondaryIds = streamIds.filter((id) => id !== activePrimary);

  useEffect(() => {
    if (isManual) return;

    // 远端流就绪通知 —— 决定渲染几路画面
    const unsubscribeStreams = ControlService.onRemoteStreams((ids) => {
      setStreamIds(ids);
    });

    return () => {
      unsubscribeStreams();
    };
  }, [isManual]);

  useEffect(() => {
    // 手动模式：订阅截图帧
    const unsubscribe = isManual
      ? ScreenCaptureService.onScreenFrame((frame: ScreenFrame) => {
          if (frame.data) {
            const cleanData = frame.data.replace(/[\r\n]/g, "");
            setScreenImage(cleanData);
          }

          // 先收窄成 const 再进 updater 闭包：TS 的类型收窄不会跨闭包保留到
          // 回调参数上，直接在闭包里读 frame.width 会退化成 number | undefined。
          const w = frame.width;
          const h = frame.height;
          if (typeof w === "number" && typeof h === "number") {
            setScreenSize((prev) =>
              prev.width === w && prev.height === h
                ? prev
                : { width: w, height: h }
            );
          }

          const ow = frame.originalWidth;
          const oh = frame.originalHeight;
          if (typeof ow === "number" && typeof oh === "number") {
            setOriginalScreenSize((prev) =>
              prev.width === ow && prev.height === oh
                ? prev
                : { width: ow, height: oh }
            );
          }
        })
      : () => {};

    const unsubscribeInfo = isManual
      ? ControlService.onScreenInfo((info: any) => {
          if (typeof info.width === "number" && typeof info.height === "number") {
            setScreenSize({ width: info.width, height: info.height });
            setOriginalScreenSize({ width: info.width, height: info.height });
          }
        })
      : () => {};

    // 连接状态 → 建立/销毁 PeerConnection
    const unsubscribeState = ControlService.onConnectionStateChange((state, data) => {
      if (state === "connected") {
        // 受控端在此收到 controller 指定的采集源
        if (device?.ip !== "P2P") {
          WebRTCService.startCall(true, captureMode);
        }
      } else {
        setError("连接中断");
        WebRTCService.stopCall();
        setStreamIds([]);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeInfo();
      unsubscribeState();
      if (!isManual) {
        WebRTCService.stopCall();
        setStreamIds([]);
      }
      ControlService.disconnect();
    };
  }, [device, captureMode, isManual]);

  // Handle touch events - Map coordinates to the controlled device screen
  const handlePointerDown = (e: any) => {
    if (localSize.width && localSize.height && screenSize.width && screenSize.height) {
      // Calculate scale to fit (contain)
      const scaleX = localSize.width / screenSize.width;
      const scaleY = localSize.height / screenSize.height;
      const scale = Math.min(scaleX, scaleY);

      const renderedW = screenSize.width * scale;
      const renderedH = screenSize.height * scale;

      const offsetX = (localSize.width - renderedW) / 2;
      const offsetY = (localSize.height - renderedH) / 2;

      // Local position relative to the container
      const localX = e.localPosition.dx;
      const localY = e.localPosition.dy;

      // Map to remote coordinates
      let remoteX = (localX - offsetX) / scale;
      let remoteY = (localY - offsetY) / scale;

      // Scale to original screen size if available
      if (originalScreenSize.width && originalScreenSize.height) {
        remoteX = remoteX * (originalScreenSize.width / screenSize.width);
        remoteY = remoteY * (originalScreenSize.height / screenSize.height);
      } else {
        remoteX = remoteX * 2;
        remoteY = remoteY * 2;
      }

      touchStartPos.current = { x: remoteX, y: remoteY };
    }
  };

  const handlePointerUp = async (e: any) => {
    if (localSize.width && localSize.height && screenSize.width && screenSize.height) {
      // Calculate scale to fit (contain)
      const scaleX = localSize.width / screenSize.width;
      const scaleY = localSize.height / screenSize.height;
      const scale = Math.min(scaleX, scaleY);

      const renderedW = screenSize.width * scale;
      const renderedH = screenSize.height * scale;

      const offsetX = (localSize.width - renderedW) / 2;
      const offsetY = (localSize.height - renderedH) / 2;

      // Local position relative to the container
      const localX = e.localPosition.dx;
      const localY = e.localPosition.dy;

      // Map to remote coordinates
      let remoteX = (localX - offsetX) / scale;
      let remoteY = (localY - offsetY) / scale;

      // Scale to original screen size if available
      if (originalScreenSize.width && originalScreenSize.height) {
        remoteX = remoteX * (originalScreenSize.width / screenSize.width);
        remoteY = remoteY * (originalScreenSize.height / screenSize.height);
      } else {
        remoteX = remoteX * 2;
        remoteY = remoteY * 2;
      }

      const startX = touchStartPos.current.x;
      const startY = touchStartPos.current.y;

      const distance = Math.sqrt(
        Math.pow(remoteX - startX, 2) + Math.pow(remoteY - startY, 2)
      );

      if (distance < 10) {
        // Click
        await sendClick(remoteX, remoteY);
      } else {
        // Swipe
        await sendSwipe(startX, startY, remoteX, remoteY);
      }
    }
  };

  const sendClick = async (x: number, y: number) => {
    await ControlService.sendClick(x, y);
  };

  const sendSwipe = async (
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => {
    await ControlService.sendSwipe(startX, startY, endX, endY, 300);
  };

  const handleBack = () => ControlService.sendBack();
  const handleHome = () => ControlService.sendHome();
  const handleRecent = () => ControlService.sendRecent();


  if (error) {
    return (
      <Scaffold
        appBar={
          <AppBar
            title={<Text text="连接错误" fontSize={20} fontWeight="bold" color="#FFFFFF" />}
            leading={
              <GestureDetector onTap={() => navigator.pop()}>
                <Container padding={4}>
                  <Icon name="arrow_back" size={24} color="#FFFFFF" />
                </Container>
              </GestureDetector>
            }
            backgroundColor="#F44336"
          />
        }
      >
        <Container color="#000000">
          <Column
            mainAxisAlignment="center"
            crossAxisAlignment="center"
            padding={32}
          >
            <Icon name="error" size={64} color="#F44336" />
            <Text
              text={error}
              fontSize={16}
              color="#FFFFFF"
              margin={{ top: 16 }}
            />
            <Button
              text="返回"
              onTap={() => navigator.pop()}
              margin={{ top: 24 }}
            />
            <Button
              text="加载测试图片"
              onTap={() => {
                // Base64 for a 1x1 red pixel
                const testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
                setScreenImage(testImage);
                setError(null);
              }}
              margin={{ top: 24 }}
            />
          </Column>
        </Container>
      </Scaffold>
    );
  }

  return (
    <Scaffold
      backgroundColor={isWebRTC ? "transparent" : undefined}
      appBar={
        showControls ? (
          <AppBar
            title={<Text text={device?.name || "AnyLink 远程"} fontSize={20} fontWeight="bold" color="#FFFFFF" />}
            leading={
              <GestureDetector onTap={() => navigator.pop()}>
                <Container padding={4}>
                  <Icon name="arrow_back" size={24} color="#FFFFFF" />
                </Container>
              </GestureDetector>
            }
            backgroundColor="#2563EB"
          />
        ) : undefined
      }
    >
      <Stack>
        <Positioned left={0} right={0} top={0} bottom={0}>
          <Container color={isWebRTC ? "transparent" : "#000000"}>
            <VisibilityDetector
              onVisibilityChanged={(info) => {
                if (info.size.width !== localSize.width || info.size.height !== localSize.height) {
                  setLocalSize(info.size);
                }
              }}
            >
              <PointerListener
                onPointerDown={(e: any) => handlePointerDown(e)}
                onPointerUp={(e: any) => handlePointerUp(e)}
              >
                <Container alignment="center" width={localSize.width || 300} height={localSize.height || 600} color={isWebRTC ? "transparent" : "#333333"}>
                  {isWebRTC ? (
                    activePrimary ? (
                      <VideoStage
                        activePrimary={activePrimary}
                        secondaryIds={secondaryIds}
                        onSelectPrimary={setPrimaryId}
                      />
                    ) : (
                      <Column mainAxisAlignment="center">
                        <CircularProgressIndicator color="#2563EB" />
                        <Text
                          text="等待画面..."
                          fontSize={14}
                          color="#888888"
                          margin={{ top: 16 }}
                        />
                      </Column>
                    )
                  ) : (
                    screenImage ? (
                      <Stack>
                        <Image
                          url={screenImage}
                          fit="contain"
                          width={localSize.width || 300}
                          height={localSize.height || 600}
                        />
                      </Stack>
                    ) : (
                      <Column mainAxisAlignment="center">
                        <CircularProgressIndicator color="#2563EB" />
                        <Text
                          text="等待画面..."
                          fontSize={14}
                          color="#888888"
                          margin={{ top: 16 }}
                        />
                      </Column>
                    )
                  )}
                </Container>
              </PointerListener>
            </VisibilityDetector>
          </Container>
        </Positioned>

        {/* Control floating window */}
        {showControls && (
          <Positioned bottom={40} left={20} right={20}>
            <Column>
              {/* FPS Display */}
              <Container
                margin={{ bottom: 10 }}
                padding={4}
                decoration={{ color: "#00000080", borderRadius: 4 }}
                alignment="center"
              >
                <FpsBadge enabled={showControls} manual={isManual} />
              </Container>

              <Container
                padding={12}
                decoration={{
                  color: "#00000080",
                  borderRadius: 30,
                }}
              >
                <Row mainAxisAlignment="spaceEvenly">
                  <GestureDetector onTap={handleBack}>
                    <Container padding={8}><Icon name="arrow_back" size={24} color="#FFFFFF" /></Container>
                  </GestureDetector>
                  <GestureDetector onTap={handleHome}>
                    <Container padding={8}><Icon name="home" size={24} color="#FFFFFF" /></Container>
                  </GestureDetector>
                  <GestureDetector onTap={handleRecent}>
                    <Container padding={8}><Icon name="apps" size={24} color="#FFFFFF" /></Container>
                  </GestureDetector>
                  <GestureDetector onTap={() => setShowControls(false)}>
                    <Container
                      padding={8}
                    >
                      <Icon name="close" size={24} color="#FFFFFF" />
                    </Container>
                  </GestureDetector>
                </Row>
              </Container>
            </Column>
          </Positioned>
        )}

        {/* Show control button */}
        {!showControls && (
          <Positioned bottom={40} right={20}>
            <GestureDetector onTap={() => setShowControls(true)}>
              <Container
                width={50}
                height={50}
                decoration={{
                  color: "#1976D2",
                  borderRadius: 25,
                  boxShadow: {
                    color: "#00000040",
                    blurRadius: 8,
                    offset: { dx: 0, dy: 4 },
                  },
                }}
                alignment="center"
              >
                <Icon name="settings" size={24} color="#FFFFFF" />
              </Container>
            </GestureDetector>
          </Positioned>
        )}
      </Stack>
    </Scaffold>
  );
}
