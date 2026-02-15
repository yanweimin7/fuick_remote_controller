# Remote Control Relay Server

A simple Node.js TCP relay server that facilitates WAN connection between the Controller (Client) and Controlee (Host) for the Remote Control App.

## Features

- **Device Registration**: Allows the Host device to register with a unique ID.
- **Connection Forwarding**: Allows the Client to connect to a specific Host ID.
- **Traffic Relay**: Forwards all control commands and screen frames between connected devices.

## Prerequisites

- Node.js (v12 or higher)

## Installation

No external dependencies are required. This server uses the built-in `net` module.

## Usage

1.  **Start the server:**

    ```bash
    node index.js
    ```

    The server will listen on port **8888** by default.

2.  **Configure the Host (Controlee):**
    - Open the app on the device to be controlled.
    - Go to "Controlee" page.
    - Enable "Public Relay Service".
    - Enter the Relay Server IP and Port (default 8888).
    - Set a unique **Device ID** (e.g., `my-phone-1`).
    - Connect.

3.  **Configure the Client (Controller):**
    - Open the app on the controlling device.
    - Go to "Connect Device".
    - Enable "Relay Mode".
    - Enter the Relay Server IP and Port.
    - Enter the **Target Device ID** (same as Host's ID).
    - Connect.

## Protocol

- **Registration (Host -> Server):**
  `{"type": "register", "id": "DEVICE_ID"}`

- **Connection (Client -> Server):**
  `{"type": "connect", "targetId": "DEVICE_ID"}`

- **Response:**
  `{"type": "registered", "success": true}`
  `{"type": "connected", "success": true}`

All subsequent data is forwarded as-is.
