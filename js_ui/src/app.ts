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
  GestureDetector,
} from "fuickjs";

import ControllerHomePage from "./pages/controller_home";
import ControllerConnectPage from "./pages/controller_connect";
import ControllerControlPage from "./pages/controller_control";
import ControleeHomePage from "./pages/controlee_home";

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
    // 控制端路由
    Router.register("/", () => React.createElement(ModeSelectPage));
    Router.register("/controller", () =>
      React.createElement(ControllerHomePage)
    );
    Router.register("/controller/connect", (args) =>
      React.createElement(ControllerConnectPage, args as any)
    );
    Router.register("/controller/control", (args) =>
      React.createElement(ControllerControlPage, args as any)
    );

    // 被控端路由
    Router.register("/controlee", () =>
      React.createElement(ControleeHomePage)
    );

    // console.log("[RemoteControl] App initialized");
  } catch (e) {
    console.error("[RemoteControl] Init error:", e);
  }
}

// 模式选择页面
function ModeSelectPage() {
  const navigator = useNavigator();
  return React.createElement(
    Container,
    { color: "#F5F5F5" },
    React.createElement(
      Column,
      {
        mainAxisAlignment: "center",
        crossAxisAlignment: "center",
        padding: 24,
      },
      React.createElement(Text, {
        text: "远程控制",
        fontSize: 28,
        fontWeight: "bold",
        color: "#1976D2",
        margin: { bottom: 8 },
      }),
      React.createElement(Text, {
        text: "选择运行模式",
        fontSize: 16,
        color: "#666",
        margin: { bottom: 48 },
      }),
      // 控制端卡片
      React.createElement(
        GestureDetector,
        {
          onTap: () => navigator.push("/controller"),
        },
        React.createElement(
          Container,
          {
            padding: 20,
            margin: { bottom: 16 },
            decoration: {
              color: "#FFFFFF",
              borderRadius: 12,
              boxShadow: {
                color: "#00000020",
                blurRadius: 8,
                offset: { dx: 0, dy: 2 },
              },
            },
          },
          React.createElement(
            Column,
            { crossAxisAlignment: "start" },
            React.createElement(Text, {
              text: "控制端",
              fontSize: 20,
              fontWeight: "bold",
              color: "#4CAF50",
              margin: { bottom: 4 },
            }),
            React.createElement(Text, {
              text: "连接并控制其他设备",
              fontSize: 14,
              color: "#888",
            })
          )
        )
      ),
      // 被控端卡片
      React.createElement(
        GestureDetector,
        {
          onTap: () => navigator.push("/controlee"),
        },
        React.createElement(
          Container,
          {
            padding: 20,
            decoration: {
              color: "#FFFFFF",
              borderRadius: 12,
              boxShadow: {
                color: "#00000020",
                blurRadius: 8,
                offset: { dx: 0, dy: 2 },
              },
            },
          },
          React.createElement(
            Column,
            { crossAxisAlignment: "start" },
            React.createElement(Text, {
              text: "被控端",
              fontSize: 20,
              fontWeight: "bold",
              color: "#FF9800",
              margin: { bottom: 4 },
            }),
            React.createElement(Text, {
              text: "共享屏幕并接受控制",
              fontSize: 14,
              color: "#888",
            })
          )
        )
      )
    )
  );
}
