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
} from "fuickjs";
import { NetworkService } from "../services/network_service";
import { StorageService } from "../services/storage_service";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";

export default function OneClickConnectPage() {
  const navigator = useNavigator();
  const [targetId, setTargetId] = useState("");
  const [myId, setMyId] = useState("Loading...");
  const [status, setStatus] = useState("Initializing...");
  const [isConnecting, setIsConnecting] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);

  useEffect(() => {
    // Initialize Signaling
    initSignaling();

    // Load history
    loadHistory();

    // Listen for incoming connections (Acting as Controlee)
    const removeClientListener = ControlService.onClientConnected(async (data) => {
      // console.log("OneClick: Client connection event:", data);
      if (data.status === "connected") {
        setRemoteConnected(true);
        setStatus("Remote Controller Connected");

        // Auto start screen capture
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
          setStatus("Failed to start capture");
        }
      } else if (data.status === "disconnected") {
        setRemoteConnected(false);
        setStatus("Ready to Connect");
        // Capture should stop automatically or we can force it
        // ScreenCaptureService.stopCapture(); // If method exists
      }
    });

    // Cleanup
    return () => {
      removeClientListener();
      NetworkService.disconnectSignaling();
    };
  }, []);

  const initSignaling = async () => {
    setStatus("Connecting to Cloud...");
    // Connect as 'controller' but this allows both roles via topic subscription
    const connected = await NetworkService.connectSignaling('controller');
    if (connected) {
      const id = await NetworkService.getDeviceId();
      setMyId(id);
      setStatus("Ready to Connect");
    } else {
      setStatus("Network Error");
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
      setStatus("Invalid ID");
      return;
    }

    setIsConnecting(true);
    setStatus(`Connecting to ${targetId}...`);

    // Save ID
    await StorageService.setString("lastTargetId", targetId);

    try {
      const success = await NetworkService.connectToDevice(targetId);

      if (success) {
        // Navigate to Control Page immediately
        // The Control Page will handle the actual connection establishment and loading state
        navigator.push("/controller/control", {
          device: {
            ip: "P2P",
            name: `Device ${targetId}`,
            id: targetId,
          }
        });
        setIsConnecting(false);
        setStatus("Ready");
      } else {
        setStatus("Connection Request Failed");
        setIsConnecting(false);
      }
    } catch (e) {
      console.error("Connect error:", e);
      setStatus("Error Connecting");
      setIsConnecting(false);
    }
  };

  const handleStopSharing = async () => {
    await ControlService.disconnect();
    setRemoteConnected(false);
    setStatus("Ready to Connect");
  };

  return (
    <Scaffold
      backgroundColor="#F5F5F5"
      appBar={
        <AppBar
          title="Remote Control"
          centerTitle={true}
          backgroundColor="#1976D2"
          elevation={0}
        />
      }
    >
      <Stack fit="expand">
        <Column padding={20} crossAxisAlignment="stretch">
          {/* My Device ID Section */}
          <Container
            padding={20}
            decoration={{
              color: "#FFFFFF",
              borderRadius: 12,
              boxShadow: {
                color: "#0000001A",
                offset: { dx: 0, dy: 2 },
                blurRadius: 4,
              },
            }}
            margin={{ bottom: 24 }}
          >
            <Text
              text="My Device ID"
              fontSize={14}
              color="#757575"
              margin={{ bottom: 8 }}
            />
            <Row mainAxisAlignment="spaceBetween" crossAxisAlignment="center">
              <Text
                text={myId}
                fontSize={28}
                fontWeight="bold"
                color="#1976D2"
              />
              <GestureDetector onTap={() => ControlService.copyToClipboard(myId)}>
                <Icon name="content_copy" size={24} color="#757575" />
              </GestureDetector>
            </Row>
            <Text
              text="Share this ID to allow remote control"
              fontSize={12}
              color="#9E9E9E"
              margin={{ top: 8 }}
            />
          </Container>

          {/* Connect to Remote Section */}
          <Container
            padding={20}
            decoration={{
              color: "#FFFFFF",
              borderRadius: 12,
              boxShadow: {
                color: "#0000001A",
                offset: { dx: 0, dy: 2 },
                blurRadius: 4,
              },
            }}
          >
            <Text
              text="Control Remote Device"
              fontSize={16}
              fontWeight="bold"
              color="#212121"
              margin={{ bottom: 16 }}
            />

            <Container
              decoration={{
                color: "#F5F5F5",
                borderRadius: 8,
              }}
              padding={{ horizontal: 16, vertical: 4 }}
            >
              <TextField
                text={targetId}
                hintText="Enter Partner ID"
                onChanged={setTargetId}
                keyboardType="number"
                maxLines={1}
              />
            </Container>

            <SizedBox height={20} />
            <GestureDetector onTap={isConnecting ? () => { } : handleConnect}>
              <Container
                height={50}
                decoration={{
                  color: isConnecting ? "#B0BEC5" : "#1976D2",
                  borderRadius: 8,
                }}
                alignment="center"
              >
                {isConnecting ? (
                  <CircularProgressIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    text="Connect"
                    color="#FFFFFF"
                    fontSize={16}
                    fontWeight="bold"
                  />
                )}
              </Container>
            </GestureDetector>
          </Container>

          <SizedBox height={20} />
          <Container alignment="center">
            <Text text={status} color="#757575" fontSize={14} />
          </Container>
        </Column>

        {/* Remote Control Overlay - When we are being controlled */}
        {remoteConnected && (
          <Positioned left={0} right={0} top={0} bottom={0}>
            <Container color="#000000CC" alignment="center" padding={30}>
              <Column mainAxisAlignment="center" crossAxisAlignment="center">
                <Icon name="screen_share" size={64} color="#FFFFFF" />
                <SizedBox height={24} />
                <Text
                  text="Screen Sharing Active"
                  color="#FFFFFF"
                  fontSize={24}
                  fontWeight="bold"
                />
                <SizedBox height={8} />
                <Text
                  text="This device is being controlled remotely"
                  color="#B0BEC5"
                  fontSize={16}
                />
                <SizedBox height={48} />
                <GestureDetector onTap={handleStopSharing}>
                  <Container
                    padding={{ horizontal: 32, vertical: 16 }}
                    decoration={{
                      color: "#D32F2F",
                      borderRadius: 30,
                      border: { width: 2, color: "#FFFFFF" }
                    }}
                  >
                    <Text
                      text="Stop Sharing"
                      color="#FFFFFF"
                      fontSize={18}
                      fontWeight="bold"
                    />
                  </Container>
                </GestureDetector>
              </Column>
            </Container>
          </Positioned>
        )}
      </Stack>
    </Scaffold>
  );
}
