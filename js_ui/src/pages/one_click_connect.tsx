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
      backgroundColor={Colors.background}
      appBar={
        <AppBar
          title="AnyLink"
          centerTitle={true}
          backgroundColor={Colors.primary}
          elevation={0}
          actions={[
            <GestureDetector onTap={() => { console.log("Settings tapped"); }}>
              {/* <Container padding={16}>
                <Icon name="settings" size={24} color="#FFFFFF" />
              </Container> */}
            </GestureDetector>
          ]}
        />
      }
    >
      <Stack fit="expand">
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
                  text="Your ID"
                  fontSize={14}
                  fontWeight="bold"
                  color={Colors.textSecondary}
                  margin={{ bottom: 4 }}
                />
                <Text
                  text={myId}
                  fontSize={32}
                  fontWeight="900" // Extra bold
                  color={Colors.textPrimary}
                  letterSpacing={1.2}
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
                  text="Share this ID to allow remote access."
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
              text="Control Remote Device"
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
                hintText="Enter Partner ID"
                onChanged={setTargetId}
                keyboardType="number"
                maxLines={1}
                style={{ fontSize: 18, color: Colors.textPrimary }}
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
                    <CircularProgressIndicator color="#FFFFFF" size={20} />
                    <SizedBox width={12} />
                    <Text text="Connecting..." color="#FFFFFF" fontSize={16} fontWeight="bold" />
                  </Row>
                ) : (
                  <Text
                    text="Connect"
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

        </Column>

        {/* Remote Control Overlay - When we are being controlled */}
        {remoteConnected && (
          <Positioned left={0} right={0} top={0} bottom={0}>
            <Container color="#0F172ACC" alignment="center" padding={30}>
              <Column mainAxisAlignment="center" crossAxisAlignment="center">
                <Container
                  padding={24}
                  decoration={{
                    color: "#FFFFFF20",
                    borderRadius: 100,
                  }}
                  margin={{ bottom: 32 }}
                >
                  <Icon name="screen_share" size={64} color="#FFFFFF" />
                </Container>

                <Text
                  text="Screen Sharing Active"
                  color="#FFFFFF"
                  fontSize={24}
                  fontWeight="bold"
                  margin={{ bottom: 12 }}
                />

                <Text
                  text="This device is being controlled remotely"
                  color="#94A3B8"
                  fontSize={16}
                  margin={{ bottom: 48 }}
                />

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
                        text="Stop Sharing"
                        color="#FFFFFF"
                        fontSize={18}
                        fontWeight="bold"
                      />
                    </Row>
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
