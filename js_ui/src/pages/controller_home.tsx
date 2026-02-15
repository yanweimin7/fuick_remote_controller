import React, { useState, useEffect } from "react";
import {
  Column,
  Text,
  Container,
  ListView,
  Row,
  Icon,
  CircularProgressIndicator,
  Scaffold,
  AppBar,
  Expanded,
  GestureDetector,
  useNavigator,
} from "fuickjs";
import { NetworkService } from "../services/network_service";
import { DeviceInfo } from "../types";

export default function ControllerHomePage() {
  const navigator = useNavigator();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    loadDeviceInfo();
  }, []);

  const loadDeviceInfo = async () => {
    const info = await NetworkService.getDeviceInfo();
    setDeviceInfo(info);
  };

  const manualConnect = () => {
    navigator.push("/controller/connect", {});
  };

  return (
    <Scaffold
      appBar={
        <AppBar
          title={
            <Column>
              <Text text="控制端" fontSize={20} fontWeight="bold" color="#FFFFFF" />
              {deviceInfo ? (
                <Text
                  text={`本机: ${deviceInfo.name}`}
                  fontSize={12}
                  color="#FFFFFF80"
                  margin={{ top: 4 }}
                />
              ) : null}
            </Column>
          }
          backgroundColor="#1976D2"
        />
      }
    >
      <Container color="#F5F5F5">
        <Column>
          {/* 连接卡片 */}
          <Container padding={16}>
            <GestureDetector onTap={manualConnect}>
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
                <Row crossAxisAlignment="center">
                  <Container
                    padding={12}
                    decoration={{
                      color: "#E3F2FD",
                      borderRadius: 50,
                    }}
                  >
                    <Icon name="add_link" size={28} color="#1976D2" />
                  </Container>
                  <Expanded flex={1}>
                    <Column margin={{ left: 16 }}>
                      <Text
                        text="连接新设备"
                        fontSize={18}
                        fontWeight="bold"
                        color="#333333"
                      />
                      <Text
                        text="输入被控端的 IP 地址和端口进行连接"
                        fontSize={14}
                        color="#666666"
                        margin={{ top: 4 }}
                      />
                    </Column>
                  </Expanded>
                  <Icon name="chevron_right" size={24} color="#CCCCCC" />
                </Row>
              </Container>
            </GestureDetector>
          </Container>

          {/* 说明信息 */}
          <Container padding={16}>
            <Container
              padding={16}
              decoration={{
                color: "#FFF3E0",
                borderRadius: 8,
                border: { width: 1, color: "#FFE0B2" },
              }}
            >
              <Row crossAxisAlignment="start">
                <Icon name="help_outline" size={20} color="#F57C00" />
                <Expanded flex={1}>
                  <Column margin={{ left: 8 }}>
                    <Text
                      text="如何连接？"
                      fontSize={16}
                      fontWeight="w500"
                      color="#F57C00"
                    />
                    <Text
                      text="1. 在被控端设备上打开应用，点击“被控端”"
                      fontSize={14}
                      color="#666666"
                      margin={{ top: 8 }}
                    />
                    <Text
                      text="2. 开启“屏幕共享服务”"
                      fontSize={14}
                      color="#666666"
                      margin={{ top: 4 }}
                    />
                    <Text
                      text="3. 在本页面点击“连接新设备”，输入被控端显示的 IP 和端口"
                      fontSize={14}
                      color="#666666"
                      margin={{ top: 4 }}
                    />
                  </Column>
                </Expanded>
              </Row>
            </Container>
          </Container>
        </Column>
      </Container>
    </Scaffold>
  );
}
