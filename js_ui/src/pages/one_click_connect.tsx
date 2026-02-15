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
} from "fuickjs";
import { NetworkService } from "../services/network_service";
import { StorageService } from "../services/storage_service";
import { ControlService } from "../services/control_service";

export default function OneClickConnectPage() {
  const navigator = useNavigator();
  const [targetId, setTargetId] = useState("");
  const [myId, setMyId] = useState("Loading...");
  const [status, setStatus] = useState("Initializing...");
  const [isConnecting, setIsConnecting] = useState(false);
  const [historyIds, setHistoryIds] = useState<string[]>([]);

  useEffect(() => {
    // Initialize Signaling
    initSignaling();

    // Load history
    loadHistory();

    // Cleanup
    return () => {
      NetworkService.disconnectSignaling();
    };
  }, []);

  const initSignaling = async () => {
    setStatus("Connecting to Cloud...");
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
    // TODO: Load list of recent IDs if we implement that
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
      // 1. Connect Signaling (ensure we are connected)
      // (Already done in init, but good to check)

      // 2. Initiate WebRTC connection
      // Note: connectToDevice returns true if signaling message sent, 
      // but actual connection is async.
      // We navigate immediately and let ControllerControlPage handle the wait/retry
      // because ControllerControlPage has the logic to show "Connecting..." and handle timeouts.

      const success = await NetworkService.connectToDevice(targetId);

      if (success) {
        // Navigate to Control Page
        // Pass device info
        navigator.push("/controller/control", {
          device: {
            ip: "P2P", // Indicates WebRTC P2P
            name: `Device ${targetId}`,
            id: targetId,
          }
        });
        setIsConnecting(false); // Reset state for when we come back
        setStatus("Ready");
      } else {
        setStatus("Connection Request Failed");
        setIsConnecting(false);
      }
    } catch (e) {
      console.error(e);
      setStatus("Error: " + e);
      setIsConnecting(false);
    }
  };

  return (
    <Scaffold
      appBar={
        <AppBar
          title="Remote Control"
          backgroundColor="#1976D2"
          foregroundColor="#FFFFFF"
        />
      }
    >
      <Container padding={{ all: 24 }} color="#F5F5F5">
        <Column crossAxisAlignment="stretch">

          {/* My ID Card */}
          <Container
            padding={{ all: 16 }}
            decoration={{ color: "#FFFFFF", borderRadius: 12, boxShadow: { blurRadius: 4, color: "#00000020", offset: { dx: 0, dy: 2 } } }}
            margin={{ bottom: 32 }}
          >
            <Column>
              <Text text="My Device ID" fontSize={12} color="#888888" />
              <Text text={myId} fontSize={24} fontWeight="bold" color="#333333" margin={{ top: 4 }} />
            </Column>
          </Container>

          {/* Target Input */}
          <Text text="Connect to Device" fontSize={16} fontWeight="bold" color="#333333" margin={{ bottom: 12 }} />

          <Container
            decoration={{ color: "#FFFFFF", borderRadius: 8, border: { width: 1, color: "#DDDDDD" } }}
            padding={{ horizontal: 12 }}
            margin={{ bottom: 24 }}
          >
            <TextField
              text={targetId}
              onChanged={setTargetId}
              hintText="Enter Device ID"
              maxLines={1}
            />
          </Container>

          {/* Connect Button */}
          <GestureDetector onTap={isConnecting ? () => { } : handleConnect}>
            <Container
              padding={{ vertical: 16 }}
              decoration={{
                color: isConnecting ? "#90CAF9" : "#1976D2",
                borderRadius: 8,
                boxShadow: { blurRadius: 4, color: "#1976D240", offset: { dx: 0, dy: 4 } }
              }}
              alignment="center"
            >
              {isConnecting ? (
                <CircularProgressIndicator color="#FFFFFF" />
              ) : (
                <Text text="Connect" color="#FFFFFF" fontSize={18} fontWeight="bold" />
              )}
            </Container>
          </GestureDetector>

          <Text
            text={status}
            color={status.includes("Error") || status.includes("Failed") ? "#D32F2F" : "#888888"}
            fontSize={12}
            textAlign="center"
            margin={{ top: 16 }}
          />

          <GestureDetector onTap={() => navigator.push("/p2p", { role: "controlee" })}>
            <Container padding={{ top: 40 }} alignment="center">
              <Text text="Switch to Controlled Mode" color="#1976D2" fontSize={14} />
            </Container>
          </GestureDetector>

        </Column>
      </Container>
    </Scaffold>
  );
}
