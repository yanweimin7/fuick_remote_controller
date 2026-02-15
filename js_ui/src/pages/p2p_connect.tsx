import React, { useState, useEffect } from "react";
import {
  Column,
  Container,
  Text,
  TextField,
  useNavigator,
  Row,
  Scaffold,
  AppBar,
  Expanded,
  GestureDetector,
  Icon,
} from "fuickjs";
import { WebRTCService } from "../services/webrtc_service";
import { ControlService } from "../services/control_service";
import { ScreenCaptureService } from "../services/screen_capture_service";
import { NetworkService } from "../services/network_service";
import { StorageService } from "../services/storage_service";

const CustomButton = ({ text, onTap, backgroundColor, textColor, disabled, margin }: any) => (
  <GestureDetector onTap={disabled ? () => { } : onTap}>
    <Container
      padding={{ vertical: 12, horizontal: 24 }}
      decoration={{
        color: disabled ? "#CCCCCC" : (backgroundColor || "#1976D2"),
        borderRadius: 8,
      }}
      alignment="center"
      margin={margin}
    >
      <Text
        text={text}
        color={textColor || "#FFFFFF"}
        fontSize={16}
        fontWeight="bold"
      />
    </Container>
  </GestureDetector>
);

interface P2PConnectPageProps {
  role?: "controller" | "controlee";
}

export default function P2PConnectPage(props: P2PConnectPageProps) {
  const navigator = useNavigator();
  const [role, setRole] = useState<"controller" | "controlee">(props.role || "controller");
  const [deviceId, setDeviceId] = useState("Loading...");
  const [targetId, setTargetId] = useState("");
  const [status, setStatus] = useState("Disconnected");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Load last target ID
    StorageService.getString("lastTargetId").then(id => {
      if (id) setTargetId(id);
    });

    // Initialize Signaling
    initSignaling();

    // Listen for WebRTC connection
    let removeListener: () => void;

    console.log("Setting up connection listeners for role:", role);

    if (role === 'controller') {
      removeListener = ControlService.onConnectionStateChange((state, data) => {
        console.log("Controller: Connection state changed:", state, data);
        if (state === "connected") {
          setStatus("Connected via WebRTC");
          setIsConnected(true);
          navigator.push("/controller/control");
        } else {
          setStatus("Disconnected");
          setIsConnected(false);
        }
      });
    } else {
      // Controlee side logic
      removeListener = ControlService.onClientConnected(async (data) => {
        console.log("Controlee: Client connection event:", data);
        if (data.status === "connected") {
          setStatus("Connected via WebRTC");
          setIsConnected(true);

          if (role === "controlee") {
            // Start capture automatically for controlee
            console.log("Controlee: Starting screen capture...");
            try {
              // Add a small delay to ensure UI is ready and connection is stable
              await new Promise(resolve => setTimeout(resolve, 500));

              await ScreenCaptureService.startCapture({
                quality: 40,
                maxWidth: 720,
                maxHeight: 1280,
                frameRate: 20,
              });
              console.log("Controlee: Screen capture started successfully");
            } catch (e) {
              console.error("Controlee: Failed to start screen capture:", e);
              setStatus("Capture Start Failed");
            }
          }
        } else if (data.status === "disconnected") {
          setStatus("Disconnected");
          setIsConnected(false);
          if (role === "controlee") {
            console.log("Controlee: Stopping screen capture...");
            await ScreenCaptureService.stopCapture();
          }
        }
      });

      // Also listen for raw WebRTC state changes on Controlee side just in case
      // Sometimes onClientConnected (DataChannel open) might fire before ICE completes or vice versa?
      // Actually DataChannel open is the source of truth for 'connected'.
    }

    return () => {
      if (removeListener) removeListener();
      NetworkService.disconnectSignaling();
    };
  }, [role]);

  const initSignaling = async () => {
    setStatus("Connecting to Signaling Server...");
    const connected = await NetworkService.connectSignaling(role);
    if (connected) {
      const id = await NetworkService.getDeviceId();
      setDeviceId(id);
      setStatus("Signaling Connected. Ready.");
    } else {
      setStatus("Signaling Connection Failed.");
    }
  };

  const handleConnect = async () => {
    if (!targetId || targetId.length < 6) {
      setStatus("Invalid Device ID");
      return;
    }

    // Save target ID
    await StorageService.setString("lastTargetId", targetId);

    setStatus(`Connecting to ${targetId}...`);
    await NetworkService.connectToDevice(targetId);
  };

  return (
    <Scaffold
      appBar={
        <AppBar
          title="Remote Control Connection"
          backgroundColor="#1976D2"
          foregroundColor="#FFFFFF"
        />
      }
    >
      <Container padding={{ all: 16 }}>
        <Column crossAxisAlignment="stretch">

          {/* Role Selection */}
          <Container
            padding={{ all: 12 }}
            decoration={{ color: "#E3F2FD", borderRadius: 8 }}
            margin={{ bottom: 20 }}
          >
            <Column>
              <Text text="Select Your Role:" fontSize={14} color="#1565C0" margin={{ bottom: 8 }} />
              <Row mainAxisAlignment="spaceEvenly">
                <GestureDetector onTap={() => setRole("controller")}>
                  <Container
                    padding={{ vertical: 8, horizontal: 16 }}
                    decoration={{
                      color: role === "controller" ? "#1565C0" : "#FFFFFF",
                      borderRadius: 20,
                      border: { width: 1, color: "#1565C0" }
                    }}
                  >
                    <Text
                      text="Controller"
                      color={role === "controller" ? "#FFFFFF" : "#1565C0"}
                      fontWeight="bold"
                    />
                  </Container>
                </GestureDetector>

                <GestureDetector onTap={() => setRole("controlee")}>
                  <Container
                    padding={{ vertical: 8, horizontal: 16 }}
                    decoration={{
                      color: role === "controlee" ? "#1565C0" : "#FFFFFF",
                      borderRadius: 20,
                      border: { width: 1, color: "#1565C0" }
                    }}
                  >
                    <Text
                      text="Controlled"
                      color={role === "controlee" ? "#FFFFFF" : "#1565C0"}
                      fontWeight="bold"
                    />
                  </Container>
                </GestureDetector>
              </Row>
              <Text
                text={role === "controller" ? "You will control another device." : "Your screen will be shared."}
                fontSize={12}
                color="#1565C0"
                margin={{ top: 12 }}
                textAlign="center"
              />
            </Column>
          </Container>

          {/* Status */}
          <Text text={`Status: ${status}`} color={status.includes("Failed") ? "red" : "#808080"} margin={{ bottom: 20 }} />

          {/* Device ID Display */}
          <Container
            padding={{ all: 24 }}
            decoration={{ color: "#F5F5F5", borderRadius: 12, border: { width: 1, color: "#DDDDDD" } }}
            alignment="center"
            margin={{ bottom: 30 }}
          >
            <Text text="My Device ID" color="#808080" fontSize={14} />
            <Text text={deviceId} fontSize={32} fontWeight="bold" color="#333333" margin={{ top: 8 }} />
            <Text text="Share this ID to connect" color="#808080" fontSize={12} margin={{ top: 8 }} />
          </Container>

          {/* Controller Input */}
          {role === "controller" && !isConnected && (
            <Column>
              <Container
                decoration={{
                  border: { width: 1, color: "#CCCCCC" },
                  borderRadius: 8,
                  color: "#FFFFFF",
                }}
                padding={{ horizontal: 12 }}
              >
                <TextField
                  text={targetId}
                  onChanged={setTargetId}
                  hintText="Enter Partner's Device ID"
                />
              </Container>
              <CustomButton
                text="Connect"
                onTap={handleConnect}
                margin={{ top: 16 }}
                backgroundColor="#4CAF50"
              />
            </Column>
          )}

          {/* Connected State Actions */}
          {isConnected && (
            <CustomButton
              text="Disconnect"
              onTap={async () => {
                await WebRTCService.stopCall();
                setIsConnected(false);
                setStatus("Disconnected");
              }}
              backgroundColor="#D32F2F"
              margin={{ top: 20 }}
            />
          )}

        </Column>
      </Container>
    </Scaffold>
  );
}
