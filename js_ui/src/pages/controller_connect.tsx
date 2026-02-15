import React, { useState } from "react";
import {
  Column,
  Text,
  Container,
  Button,
  TextField,
  Row,
  Icon,
  CircularProgressIndicator,
  Scaffold,
  AppBar,
  Expanded,
  GestureDetector,
  Stack,
  Positioned,
  useNavigator,
  Switch,
} from "fuickjs";
import { DeviceInfo } from "../types";
import { NetworkService } from "../services/network_service";
import { ControlService } from "../services/control_service";

interface ControllerConnectPageProps {
  device?: DeviceInfo;
}

export default function ControllerConnectPage(props: ControllerConnectPageProps) {
  const { device } = props;
  const navigator = useNavigator();
  const [ip, setIp] = useState(device?.ip || "");
  const [port, setPort] = useState(device?.port?.toString() || "8811");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Relay mode states
  const [useRelay, setUseRelay] = useState(false);
  const [relayIp, setRelayIp] = useState("192.168.3.26");
  const [relayPort, setRelayPort] = useState("8812");
  const [targetDeviceId, setTargetDeviceId] = useState("device_1");

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    // 设置一个前端超时保护，防止原生端卡死
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(false);
      }, 15000);
    });

    try {
      let result;
      if (useRelay) {
        if (!relayIp || !relayPort || !targetDeviceId) {
          setError("请输入完整的中继服务器信息");
          setIsConnecting(false);
          return;
        }
        const portNum = parseInt(relayPort, 10);

        result = await Promise.race([
          ControlService.connectRelay(relayIp, portNum, targetDeviceId, false),
          timeoutPromise
        ]);
      } else {
        if (!ip || !port) {
          setError("请输入 IP 地址和端口");
          setIsConnecting(false);
          return;
        }
        const portNum = parseInt(port, 10);
        result = await Promise.race([
          ControlService.connectToDevice(ip, portNum),
          timeoutPromise
        ]);
      }

      setIsConnecting(false);

      if (result && (result === true || (result as any).success)) {
        // 跳转到控制页面
        navigator.push("/controller/control", {
          device: {
            name: useRelay ? `Relay: ${targetDeviceId}` : (device?.name || ip),
            ip: useRelay ? relayIp : ip,
            port: useRelay ? parseInt(relayPort) : parseInt(port)
          },
        });
      } else {
        setError(
          useRelay
            ? ("连接中继失败: " + ((result as any)?.error || "未知错误"))
            : "连接失败或超时，请确保：\n1. 两个设备在同一 Wi-Fi\n2. 被控端已开启服务\n3. 防火墙未拦截"
        );
      }
    } catch (e) {
      // console.error(`[Controller] Connection error:`, e);
      setIsConnecting(false);
      setError("连接发生异常，请重试");
    }
  };

  return (
    <Scaffold
      appBar={
        <AppBar
          title={<Text text="连接设备" fontSize={20} fontWeight="bold" color="#FFFFFF" />}
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
      <Stack>
        <Container color="#F5F5F5">
          {/* 表单 */}
          <Container padding={24}>
            <Container
              padding={24}
              decoration={{
                color: "#FFFFFF",
                borderRadius: 12,
                boxShadow: {
                  color: "#00000010",
                  blurRadius: 8,
                  offset: { dx: 0, dy: 2 },
                },
              }}
            >
              <Row
                mainAxisAlignment="spaceBetween"
                crossAxisAlignment="center"
                margin={{ bottom: 24 }}
              >
                <Text
                  text={useRelay ? "通过中继连接" : "局域网直连"}
                  fontSize={18}
                  fontWeight="w500"
                  color="#333333"
                />
                <Row crossAxisAlignment="center">
                  <Text
                    text="中继模式"
                    fontSize={12}
                    color="#666666"
                    margin={{ right: 8 }}
                  />
                  <Switch
                    value={useRelay}
                    onChanged={setUseRelay}
                  />
                </Row>
              </Row>

              {!useRelay ? (
                <>
                  {/* IP 地址 */}
                  <Column margin={{ bottom: 16 }}>
                    <Text
                      text="IP 地址"
                      fontSize={14}
                      color="#666666"
                      margin={{ bottom: 8 }}
                    />
                    <TextField
                      text={ip}
                      hintText="例如: 192.168.1.100"
                      onChanged={(val: string) => setIp(val)}
                    />
                  </Column>

                  {/* 端口 */}
                  <Column margin={{ bottom: 24 }}>
                    <Text
                      text="端口"
                      fontSize={14}
                      color="#666666"
                      margin={{ bottom: 8 }}
                    />
                    <TextField
                      text={port}
                      hintText="例如: 8080"
                      onChanged={(val: string) => setPort(val)}
                    />
                  </Column>
                </>
              ) : (
                <>
                  {/* 中继服务器 IP */}
                  <Column margin={{ bottom: 16 }}>
                    <Text
                      text="中继服务器 IP"
                      fontSize={14}
                      color="#666666"
                      margin={{ bottom: 8 }}
                    />
                    <TextField
                      text={relayIp}
                      hintText="例如: 1.2.3.4"
                      onChanged={setRelayIp}
                    />
                  </Column>

                  {/* 中继服务器端口 */}
                  <Column margin={{ bottom: 16 }}>
                    <Text
                      text="中继服务器端口"
                      fontSize={14}
                      color="#666666"
                      margin={{ bottom: 8 }}
                    />
                    <TextField
                      text={relayPort}
                      hintText="例如: 8888"
                      onChanged={setRelayPort}
                    />
                  </Column>

                  {/* 目标设备 ID */}
                  <Column margin={{ bottom: 24 }}>
                    <Text
                      text="目标设备 ID"
                      fontSize={14}
                      color="#666666"
                      margin={{ bottom: 8 }}
                    />
                    <TextField
                      text={targetDeviceId}
                      hintText="例如: device_1"
                      onChanged={setTargetDeviceId}
                    />
                  </Column>
                </>
              )}

              {error && (
                <Text
                  text={error}
                  fontSize={14}
                  color="#F44336"
                  margin={{ bottom: 16 }}
                />
              )}

              <Button
                text={isConnecting ? "正在连接..." : "立即连接"}
                onTap={handleConnect}
              />
            </Container>

            <Container margin={{ top: 24 }} padding={16}>
              <Row crossAxisAlignment="center">
                <Icon name="info" size={16} color="#999999" />
                <Text
                  text="请确保两个设备在同一个 Wi-Fi 网络下"
                  fontSize={12}
                  color="#999999"
                  margin={{ left: 8 }}
                />
              </Row>
            </Container>
          </Container>
        </Container>

        {isConnecting && (
          <Positioned top={0} bottom={0} left={0} right={0}>
            <Container color="#00000020" alignment="center">
              <Container
                padding={24}
                decoration={{
                  color: "#FFFFFF",
                  borderRadius: 12,
                }}
              >
                <Column crossAxisAlignment="center">
                  <CircularProgressIndicator color="#1976D2" />
                  <Text
                    text="正在建立连接..."
                    fontSize={14}
                    color="#333333"
                    margin={{ top: 16 }}
                  />
                </Column>
              </Container>
            </Container>
          </Positioned>
        )}
      </Stack>
    </Scaffold>
  );
}
