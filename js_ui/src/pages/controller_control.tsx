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
  Expanded,
  Stack,
  Positioned,
  useNavigator,
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
  const handleTouchStart = (e: any) => {
    const { x, y } = getRelativeCoordinates(e);
    touchStartPos.current = { x, y };
  };

  const handleTouchEnd = async (e: any) => {
    const { x, y } = getRelativeCoordinates(e);
    const startX = touchStartPos.current.x;
    const startY = touchStartPos.current.y;

    // 判断是点击还是滑动
    const distance = Math.sqrt(
      Math.pow(x - startX, 2) + Math.pow(y - startY, 2)
    );

    if (distance < 10) {
      // 点击
      await sendClick(x, y);
    } else {
      // 滑动
      await sendSwipe(startX, startY, x, y);
    }
  };

  const getRelativeCoordinates = (e: any) => {
    // 将触摸坐标转换为相对于视图的比例 (0-1)
    // 然后映射到被控端屏幕分辨率
    const layout = e.nativeEvent?.layout;
    if (!layout || !screenSize.width) {
      return { x: 0, y: 0 };
    }

    const scaleX = screenSize.width / layout.width;
    const scaleY = screenSize.height / layout.height;

    return {
      x: e.x * scaleX,
      y: e.y * scaleY,
    };
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
          <GestureDetector
            onPanStart={(e: any) => handleTouchStart(e)}
            onPanEnd={(e: any) => handleTouchEnd(e)}
          >
            <Container alignment="center">
              {screenImage ? (
                <Image
                  url={`data:image/jpeg;base64,${screenImage}`}
                  fit="contain"
                  // @ts-ignore: gaplessPlayback is added dynamically
                  gaplessPlayback={true} // 避免图片切换时闪烁
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
          </GestureDetector>
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
