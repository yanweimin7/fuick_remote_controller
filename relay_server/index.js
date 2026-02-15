const net = require('net');

const PORT = 8812;
const devices = new Map(); // id -> socket

const server = net.createServer((socket) => {
    let deviceId = null;
    let isController = false;

    console.log(`New connection from ${socket.remoteAddress}:${socket.remotePort}`);

    // Buffer to handle incoming JSON messages
    let buffer = '';

    socket.on('data', (data) => {
        // If already paired, forward data directly
        if (socket.targetSocket) {
            try {
                socket.targetSocket.write(data);
            } catch (e) {
                console.error('Error forwarding data:', e);
                cleanup();
            }
            return;
        }

        // Process handshake/control messages
        buffer += data.toString();

        // Split by newline to handle multiple messages in one chunk
        let lines = buffer.split('\n');
        // If the last line is not empty, it means we have an incomplete message
        if (buffer.endsWith('\n')) {
            buffer = '';
        } else {
            buffer = lines.pop();
        }

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                console.log('Received message:', line);
                const msg = JSON.parse(line);

                if (msg.type === 'register') {
                    // Device registration
                    deviceId = msg.id;
                    if (devices.has(deviceId)) {
                        // Close old connection if exists
                        const oldSocket = devices.get(deviceId);
                        if (oldSocket !== socket) {
                            console.log(`Device ${deviceId} re-registered, closing old connection`);
                            oldSocket.destroy();
                        }
                    }
                    devices.set(deviceId, socket);
                    console.log(`Device registered: ${deviceId}`);
                    socket.write(JSON.stringify({ type: 'registered', success: true }) + '\n');

                } else if (msg.type === 'connect') {
                    // Controller connecting to device
                    isController = true;
                    const targetId = msg.targetId;
                    const targetSocket = devices.get(targetId);

                    if (targetSocket) {
                        console.log(`Controller connecting to ${targetId}`);

                        // Link sockets
                        socket.targetSocket = targetSocket;
                        targetSocket.targetSocket = socket;

                        // Notify both sides
                        socket.write(JSON.stringify({ type: 'connected', success: true }) + '\n');
                        targetSocket.write(JSON.stringify({ type: 'connected', success: true, from: 'controller' }) + '\n');

                    } else {
                        console.log(`Device ${targetId} not found`);
                        socket.write(JSON.stringify({ type: 'connected', success: false, error: 'Device not found' }) + '\n');
                        // socket.end(); // Don't close immediately, let client decide
                    }
                }
            } catch (e) {
                console.error('Error processing message:', e);
            }
        }
    });

    const cleanup = () => {
        if (deviceId) {
            if (devices.get(deviceId) === socket) {
                devices.delete(deviceId);
                console.log(`Device ${deviceId} unregistered`);
            }
        }
        if (socket.targetSocket) {
            // Notify peer if needed, or just close
            socket.targetSocket.end();
            socket.targetSocket.targetSocket = null;
            socket.targetSocket = null;
        }
    };

    socket.on('error', (err) => {
        console.error(`Socket error (${deviceId || 'unknown'}):`, err.message);
        cleanup();
    });

    socket.on('close', () => {
        console.log(`Connection closed (${deviceId || 'unknown'})`);
        cleanup();
    });
});

server.listen(PORT, () => {
    console.log(`Relay server listening on port ${PORT}`);
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please check if another instance is running.`);
        process.exit(1);
    } else {
        console.error('Server error:', e);
    }
});
