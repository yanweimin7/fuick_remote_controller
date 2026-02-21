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
import { WebRTCService } from "../services/webrtc_service";
import { DeviceInfo, ScreenFrame } from "../types";

// Custom WebRTC Video View Component
const RTCVideoView = (props: any) => React.createElement("RTCVideoView", props);

interface ControllerControlPageProps {
  device?: DeviceInfo;
  captureMode?: string;
}

export default function ControllerControlPage(props: ControllerControlPageProps) {
  const { device, captureMode } = props;
  const isWebRTC = captureMode === 'webrtc';
  const navigator = useNavigator();
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
    // Listen for screen frames
    const unsubscribe = ScreenCaptureService.onScreenFrame((frame: ScreenFrame) => {
      // Log received frame details
      if (frame.data) {
        // Ensure no newlines in base64
        const cleanData = frame.data.replace(/[\r\n]/g, "");
        setScreenImage(cleanData);
      }

      // Calculate FPS
      frameCount.current++;
      const now = Date.now();
      if (now - lastTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastTime.current = now;
      }

      // Optimization: Update screenSize only when dimensions change to avoid unnecessary re-renders
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

    // Listen for screen info (WebRTC mode)
    const unsubscribeInfo = ControlService.onScreenInfo((info: any) => {
      if (typeof info.width === 'number' && typeof info.height === 'number') {
        const newWidth = info.width;
        const newHeight = info.height;

        setScreenSize((prev) => {
          if (prev.width === newWidth && prev.height === newHeight) return prev;
          return { width: newWidth, height: newHeight };
        });

        setOriginalScreenSize((prev) => {
          if (prev.width === newWidth && prev.height === newHeight) return prev;
          return { width: newWidth, height: newHeight };
        });
      }
    });

    // WebRTC setup
    // const unsubscribeWebRTC = WebRTCService.setup();

    // Listen for connection state
    const unsubscribeState = ControlService.onConnectionStateChange(
      (state, data) => {
        if (state === "connected") {
          // Start WebRTC Call only if not P2P (P2P uses manual token exchange)
          if (device?.ip !== "P2P") {
            WebRTCService.startCall(true, captureMode);
          }
        } else {
          setError("连接中断");
          WebRTCService.stopCall();
        }
      }
    );

    return () => {
      unsubscribe();
      unsubscribeInfo();
      unsubscribeState();
      // unsubscribeWebRTC();
      WebRTCService.stopCall();
      ControlService.disconnect();
    };
  }, [device, captureMode]);

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
                    <RTCVideoView
                      objectFit="contain"
                      mirror={false}
                    />
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
