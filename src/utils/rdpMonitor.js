const { Client } = require('ssh2');
const net = require('net');

class RDPMonitor {
    constructor(host, username, password, rdpPassword, rdpPort = 3389) {
        this.host = host;
        this.username = username;
        this.password = password;
        this.rdpPassword = rdpPassword;
        this.rdpPort = rdpPort;
        this.sshConnection = null;
    }

    async testRDPConnection() {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timeout = 5000;

            socket.setTimeout(timeout);

            socket.on('connect', () => {
                socket.destroy();
                resolve({
                    success: true,
                    message: 'RDP port is accessible'
                });
            });

            socket.on('error', (err) => {
                socket.destroy();
                resolve({
                    success: false,
                    message: `RDP connection failed: ${err.message}`
                });
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve({
                    success: false,
                    message: 'Connection timeout'
                });
            });

            socket.connect(this.rdpPort, this.host);
        });
    }

    async waitForRDPReady(timeoutMs = 2700000) {
        const startTime = Date.now();
        const maxRetries = Math.floor(timeoutMs / 30000);
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                const testResult = await this.testRDPConnection();
                const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);

                if (testResult.success) {
                    return {
                        success: true,
                        rdpReady: true,
                        totalTime: elapsedMinutes,
                        message: 'RDP is ready and accessible'
                    };
                }

                retryCount++;
                if (retryCount < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }

            } catch (error) {
                console.error('Error testing RDP:', error);
                retryCount++;
                if (retryCount < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        }

        const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
        return {
            success: true,
            rdpReady: false,
            totalTime: elapsedMinutes,
            message: 'Installation completed but RDP may need more time to be ready'
        };
    }

    disconnect() {
        if (this.sshConnection) {
            this.sshConnection.end();
            this.sshConnection = null;
        }
    }
}

module.exports = RDPMonitor;