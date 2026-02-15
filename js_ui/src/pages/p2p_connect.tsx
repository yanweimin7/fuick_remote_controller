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

export default function P2PConnectPage(props: any) {
  const navigator = useNavigator();
  const [role, setRole] = useState<"controller" | "controlee">(props.role || "controller");
  const [step, setStep] = useState(1);
  const [offerToken, setOfferToken] = useState("");
  const [answerToken, setAnswerToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connectedClient, setConnectedClient] = useState<any>(null);

  useEffect(() => {
    if (role === "controlee") {
      const removeListener = ControlService.onClientConnected(async (data) => {
        if (data.status === "connected") {
          setConnectedClient(data.client);
          // Start capture
          await ScreenCaptureService.startCapture({
            quality: 50,
            maxWidth: 720,
            maxHeight: 1280,
            frameRate: 30,
          });
        } else if (data.status === "disconnected") {
          setConnectedClient(null);
          await ScreenCaptureService.stopCapture();
        }
      });
      return () => {
        removeListener();
        ScreenCaptureService.stopCapture();
      };
    } else {
      ScreenCaptureService.stopCapture();
    }
  }, [role]);

  const handleDisconnect = async () => {
    await WebRTCService.stopCall();
    await ScreenCaptureService.stopCapture();
    setConnectedClient(null);
    setStep(1);
    setOfferToken("");
    setAnswerToken("");
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await ControlService.copyToClipboard(text);
      // Ideally show a toast
    } catch (e) {
      console.error("Copy failed", e);
    }
  };

  // Manual Mode Handlers
  const handleGenerateOffer = async () => {
    setLoading(true);
    setError("");
    try {
      // Controller creates Offer
      const token = await WebRTCService.createOfferToken();
      setOfferToken(token);
      setStep(2);
    } catch (e: any) {
      setError("生成失败: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAnswer = async () => {
    if (!offerToken) return;
    setLoading(true);
    setError("");
    try {
      // Controlee creates Answer based on Offer
      const token = await WebRTCService.createAnswerToken(offerToken);
      setAnswerToken(token);
      setStep(2);
    } catch (e: any) {
      setError("生成失败: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectManual = async () => {
    if (!answerToken) return;
    setLoading(true);
    setError("");
    try {
      await WebRTCService.completeConnection(answerToken);
      // Wait a bit for connection to stabilize
      setTimeout(() => {
        navigator.push("/controller/control", { device: { name: "P2P Device", ip: "P2P", port: 0 } });
      }, 1000);
    } catch (e: any) {
      setError("连接失败: " + e.message);
      setLoading(false);
    }
  };

  return (
    <Scaffold
      appBar={
        <AppBar
          title={<Text text="P2P 直连" fontSize={18} color="#FFFFFF" />}
          backgroundColor="#1976D2"
        />
      }
    >
      <Container padding={16} color="#F5F5F5">
        <Column>
          <Container padding={16} decoration={{ color: "white", borderRadius: 8 }}>
            <Column>
              {/* Role Switcher */}
              <Row margin={{ bottom: 20 }}>
                <Expanded>
                  <CustomButton
                    text="我是控制端"
                    backgroundColor={role === "controller" ? "#1976D2" : "#E0E0E0"}
                    textColor={role === "controller" ? "#FFFFFF" : "#333333"}
                    onTap={() => { setRole("controller"); setStep(1); setOfferToken(""); setAnswerToken(""); setError(""); }}
                    margin={{ right: 8 }}
                  />
                </Expanded>
                <Expanded>
                  <CustomButton
                    text="我是被控端"
                    backgroundColor={role === "controlee" ? "#1976D2" : "#E0E0E0"}
                    textColor={role === "controlee" ? "#FFFFFF" : "#333333"}
                    onTap={() => { setRole("controlee"); setStep(1); setOfferToken(""); setAnswerToken(""); setError(""); }}
                    margin={{ left: 8 }}
                  />
                </Expanded>
              </Row>

              {error ? <Text text={error} color="red" margin={{ bottom: 10 }} /> : null}

              {/* Manual Mode Content */}
              <Column>
                {role === "controller" ? (
                  <Column>
                    {step === 1 && (
                      <Column>
                        <Text text="1. 点击生成连接码，并发送给被控端。" color="#666" margin={{ bottom: 10 }} />
                        <CustomButton
                          text={loading ? "生成中..." : "生成连接码"}
                          backgroundColor="#4CAF50"
                          textColor="#FFFFFF"
                          onTap={handleGenerateOffer}
                          disabled={loading}
                        />
                      </Column>
                    )}

                    {step >= 2 && (
                      <Column>
                        <Text text="1. 连接码 (已压缩，点击复制):" fontSize={14} margin={{ bottom: 5 }} />
                        <GestureDetector onTap={() => handleCopy(offerToken)}>
                          <Container
                            padding={8}
                            decoration={{ border: { width: 1, color: "#ccc" }, borderRadius: 4 }}
                            height={100}
                          >
                            <Text text={offerToken} fontSize={12} />
                          </Container>
                        </GestureDetector>

                        <Text text="2. 输入被控端的响应码:" fontSize={14} margin={{ top: 20, bottom: 5 }} />
                        <TextField
                          text={answerToken}
                          onChanged={setAnswerToken}
                          hintText="在此粘贴响应码"
                        />

                        <CustomButton
                          text={loading ? "连接中..." : "开始控制"}
                          backgroundColor="#1976D2"
                          textColor="#FFFFFF"
                          margin={{ top: 20 }}
                          onTap={handleConnectManual}
                          disabled={loading || !answerToken}
                        />
                      </Column>
                    )}
                  </Column>
                ) : (
                  <Column>
                    {connectedClient ? (
                      <Column>
                        <Container
                          padding={24}
                          decoration={{
                            color: "#E8F5E9",
                            borderRadius: 12,
                            border: { width: 1, color: "#C8E6C9" },
                          }}
                          margin={{ bottom: 20 }}
                        >
                          <Column crossAxisAlignment="center">
                            <Icon name="phonelink_setup" size={48} color="#4CAF50" />
                            <Text
                              text="已连接控制端"
                              fontSize={20}
                              fontWeight="bold"
                              color="#2E7D32"
                              margin={{ top: 16 }}
                            />
                            <Text
                              text="屏幕正在共享中"
                              fontSize={14}
                              color="#666"
                              margin={{ top: 8 }}
                            />
                          </Column>
                        </Container>
                        <CustomButton
                          text="断开连接"
                          backgroundColor="#D32F2F"
                          textColor="#FFFFFF"
                          onTap={handleDisconnect}
                        />
                      </Column>
                    ) : (
                      <Column>
                        {step === 1 && (
                          <Column>
                            <Text text="1. 输入控制端的连接码:" fontSize={14} margin={{ bottom: 5 }} />
                            <TextField
                              text={offerToken}
                              onChanged={setOfferToken}
                              hintText="在此粘贴连接码"
                            />
                            <CustomButton
                              text={loading ? "生成中..." : "生成响应码"}
                              backgroundColor="#4CAF50"
                              textColor="#FFFFFF"
                              margin={{ top: 20 }}
                              onTap={handleGenerateAnswer}
                              disabled={loading || !offerToken}
                            />
                          </Column>
                        )}

                        {step === 2 && (
                          <Column>
                            <Text text="2. 响应码 (已压缩，点击复制):" fontSize={14} margin={{ bottom: 5 }} />
                            <GestureDetector onTap={() => handleCopy(answerToken)}>
                              <Container
                                padding={8}
                                decoration={{ border: { width: 1, color: "#ccc" }, borderRadius: 4 }}
                                height={100}
                              >
                                <Text text={answerToken} fontSize={12} />
                              </Container>
                            </GestureDetector>
                            <Text
                              text="等待控制端连接..."
                              color="green"
                              textAlign="center"
                              margin={{ top: 20 }}
                            />
                          </Column>
                        )}
                      </Column>
                    )}
                  </Column>
                )}
              </Column>
            </Column>
          </Container>
        </Column>
      </Container>
    </Scaffold>
  );
}
