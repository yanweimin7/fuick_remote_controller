import React from "react";
import {
  Router,
  Runtime,
  setGlobalErrorFallback,
  useNavigator,
  Column,
  Text,
  Container,
  Button,
} from "fuickjs";

import ControllerControlPage from "./pages/controller_control";
import OneClickConnectPage from "./pages/one_click_connect";

// 全局错误处理 UI
const CustomErrorUI = (error: Error) =>
  React.createElement(CustomErrorComponent, { error });

const CustomErrorComponent = ({ error }: { error: Error }) => {
  const navigator = useNavigator();
  return React.createElement(
    Container,
    { color: "#FFEBEE" },
    React.createElement(
      Column,
      {
        mainAxisAlignment: "center",
        crossAxisAlignment: "center",
        padding: 30,
      },
      React.createElement(Text, {
        text: "出错了",
        fontSize: 22,
        color: "#C62828",
        fontWeight: "bold",
        margin: { bottom: 16 },
      }),
      React.createElement(
        Container,
        {
          padding: 12,
          decoration: {
            color: "#FFFFFF",
            borderRadius: 8,
            border: { width: 1, color: "#FFCDD2" },
          },
          margin: { bottom: 20 },
        },
        React.createElement(Text, {
          text: error?.message || "未知错误",
          fontSize: 14,
          color: "#D32F2F",
          maxLines: 5,
          overflow: "ellipsis",
        })
      ),
      React.createElement(Button, {
        text: "返回首页",
        onTap: () => navigator.push("/"),
      })
    )
  );
};

export function initApp() {
  try {
    Runtime.bindGlobals();
    setGlobalErrorFallback(CustomErrorUI);

    // 首页直接显示 One Click 连接页面
    Router.register("/", (args) => React.createElement(OneClickConnectPage, args as any));

    // 控制页面
    Router.register("/controller/control", (args) =>
      React.createElement(ControllerControlPage, args as any)
    );

    // console.log("[RemoteControl] App initialized");
  } catch (e) {
    console.error("[RemoteControl] Init error:", e);
  }
}
