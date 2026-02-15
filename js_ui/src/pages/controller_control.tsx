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
  VisibilityDetector,
} from "fuickjs";
import { NetworkService } from "../services/network_service";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";
import { DeviceInfo, ScreenFrame } from "../types";

interface ControllerControlPageProps {
  device?: DeviceInfo;
}

export default function ControllerControlPage(props: ControllerControlPageProps) {
  const { device } = props;
  const navigator = useNavigator();
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenImage, setScreenImage] = useState<string | null>(null);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [originalScreenSize, setOriginalScreenSize] = useState({ width: 0, height: 0 });
  const [localSize, setLocalSize] = useState({ width: 0, height: 0 });
  const [showControls, setShowControls] = useState(true);
  const [fps, setFps] = useState(0);

  const touchStartPos = useRef({ x: 0, y: 0 });
  const viewRef = useRef<any>(null);
  const frameCount = useRef(0);
  const lastTime = useRef(Date.now());

  useEffect(() => {
    if (device) {
      connect();
    }

    // 监听屏幕帧数据
    const unsubscribe = ScreenCaptureService.onScreenFrame((frame: ScreenFrame) => {
      if (frame.data) {
        setScreenImage(frame.data);
      }

      // 计算 FPS
      frameCount.current++;
      const now = Date.now();
      if (now - lastTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastTime.current = now;
      }

      // 优化：仅当宽高变化时才更新 screenSize，避免不必要的重渲染
      if (typeof frame.width === 'number' && typeof frame.height === 'number') {
        const newWidth = frame.width;
        const newHeight = frame.height;
        setScreenSize((prev) => {
          if (prev.width === newWidth && prev.height === newHeight) return prev;
          return { width: newWidth, height: newHeight };
        });
      }

      if (typeof frame.originalWidth === 'number' && typeof frame.originalHeight === 'number') {
        const newWidth = frame.originalWidth;
        const newHeight = frame.originalHeight;
        setOriginalScreenSize((prev) => {
          if (prev.width === newWidth && prev.height === newHeight) return prev;
          return { width: newWidth, height: newHeight };
        });
      }
    });

    // 监听连接状态
    const unsubscribeState = ControlService.onConnectionStateChange(
      (state, data) => {
        if (state === "connected") {
          setIsConnected(true);
          setIsConnecting(false);
        } else {
          setIsConnected(false);
          setError("连接已断开");
        }
      }
    );

    return () => {
      unsubscribe();
      unsubscribeState();
      ControlService.disconnect();
    };
  }, [device]);

  const connect = async () => {
    if (!device) return;

    // 检查是否已经连接
    const connected = await ControlService.isConnected();
    if (connected) {
      setIsConnected(true);
      setIsConnecting(false);
      return;
    }

    setIsConnecting(true);
    setError(null);

    const success = await ControlService.connectToDevice(device.ip, device.port);
    if (!success) {
      setError("连接失败，请检查网络");
      setIsConnecting(false);
    }
  };

  // 处理触摸事件 - 将坐标映射到被控端屏幕
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


  if (isConnecting) {
    return (
      <Scaffold
        appBar={
          <AppBar
            title={<Text text="正在连接..." fontSize={20} fontWeight="bold" color="#FFFFFF" />}
            leading={
              <GestureDetector onTap={() => navigator.pop()}>
                <Container padding={4}>
                  <Icon name="arrow_back" size={24} color="#FFFFFF" />
                </Container>
              </GestureDetector>
            }
            backgroundColor="#1976D2"
          />
        }
      >
        <Container color="#000000">
          <Column
            mainAxisAlignment="center"
            crossAxisAlignment="center"
          >
            <CircularProgressIndicator color="#1976D2" />
            <Text
              text="正在连接设备..."
              fontSize={16}
              color="#FFFFFF"
              margin={{ top: 16 }}
            />
            {device && (
              <Text
                text={`${device.name} (${device.ip})`}
                fontSize={12}
                color="#888888"
                margin={{ top: 8 }}
              />
            )}
          </Column>
        </Container>
      </Scaffold>
    );
  }

  if (error) {
    return (
      <Scaffold
        appBar={
          <AppBar
            title={<Text text="连接出错" fontSize={20} fontWeight="bold" color="#FFFFFF" />}
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
              text="重新连接"
              onTap={connect}
              margin={{ top: 24 }}
            />
          </Column>
        </Container>
      </Scaffold>
    );
  }

  return (
    <Scaffold
      appBar={
        showControls ? (
          <AppBar
            title={<Text text={device?.name || "远程控制"} fontSize={20} fontWeight="bold" color="#FFFFFF" />}
            leading={
              <GestureDetector onTap={() => navigator.pop()}>
                <Container padding={4}>
                  <Icon name="arrow_back" size={24} color="#FFFFFF" />
                </Container>
              </GestureDetector>
            }
            backgroundColor="#1976D2"
          />
        ) : undefined
      }
    >
      <Stack>
        <Container color="#000000">
          <VisibilityDetector
            onVisibilityChanged={(info) => {
              if (info.size.width !== localSize.width || info.size.height !== localSize.height) {
                setLocalSize(info.size);
                console.log(`[TS] Local size updated: ${info.size.width}x${info.size.height}`);
              }
            }}
          >
            <PointerListener
              onPointerDown={(e: any) => handlePointerDown(e)}
              onPointerUp={(e: any) => handlePointerUp(e)}
            >
              <Container alignment="center">
                {screenImage ? (
                  <Image
                    url={`data:image/jpeg;base64,${screenImage}`}
                    fit="contain"
                  />
                ) : (
                  <Column mainAxisAlignment="center">
                    <CircularProgressIndicator color="#1976D2" />
                    <Text
                      text="等待画面..."
                      fontSize={14}
                      color="#888888"
                      margin={{ top: 16 }}
                    />
                  </Column>
                )}
              </Container>
            </PointerListener>
          </VisibilityDetector>
        </Container>

        {/* 控制浮窗 */}
        {showControls && (
          <Positioned bottom={40} left={20} right={20}>
            <Column>
              {/* FPS 显示 */}
              <Container
                margin={{ bottom: 10 }}
                padding={4}
                decoration={{ color: "#00000080", borderRadius: 4 }}
                alignment="center"
              >
                <Text text={`FPS: ${fps}`} color="#00FF00" fontSize={12} />
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

        {/* 显示控制按钮 */}
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
