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

// Global error handling UI
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
        text: "Error Occurred",
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
          text: error?.message || "Unknown Error",
          fontSize: 14,
          color: "#D32F2F",
          maxLines: 5,
          overflow: "ellipsis",
        })
      ),
      React.createElement(Button, {
        text: "Back to Home",
        onTap: () => navigator.push("/"),
      })
    )
  );
};

export function initApp() {
  try {
    Runtime.bindGlobals();
    setGlobalErrorFallback(CustomErrorUI);

    // Home page directly displays One Click Connect page
    Router.register("/", (args) => React.createElement(OneClickConnectPage, args as any));

    // Control page
    Router.register("/controller/control", (args) =>
      React.createElement(ControllerControlPage, args as any)
    );

    // console.log("[RemoteControl] App initialized");
  } catch (e) {
    console.error("[RemoteControl] Init error:", e);
  }
}
