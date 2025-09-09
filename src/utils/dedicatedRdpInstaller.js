const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

async function installDedicatedRDP(host, username, password, config, onLog) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        
        conn.on('ready', async () => {
            try {
                // Read the tele.sh script
                const scriptPath = path.join(__dirname, '../../scripts/tele.sh');
                const scriptContent = fs.readFileSync(scriptPath, 'utf8');
                
                // Upload the script to the remote server
                await new Promise((resolve, reject) => {
                    conn.sftp((err, sftp) => {
                        if (err) reject(err);
                        
                        const writeStream = sftp.createWriteStream('/root/tele.sh');
                        writeStream.write(scriptContent);
                        writeStream.end();
                        writeStream.on('close', resolve);
                        writeStream.on('error', reject);
                    });
                });

                // Make the script executable and run it
                const command = `chmod +x /root/tele.sh && bash /root/tele.sh "${config.password}" "${config.osVersion}" && rm -f /root/tele.sh`;
                
                conn.exec(command, (err, stream) => {
                    if (err) {
                        conn.end();
                        reject(err);
                        return;
                    }

                    let progress = 0;
                    const progressInterval = setInterval(() => {
                        progress += 2;
                        if (progress <= 100) {
                            onLog && onLog(`Installation progress: ${progress}%`);
                        } else {
                            clearInterval(progressInterval);
                        }
                    }, 5000);

                    stream.on('data', (data) => {
                        onLog && onLog(data.toString());
                    });

                    stream.stderr.on('data', (data) => {
                        onLog && onLog(data.toString());
                    });

                    stream.on('close', (code) => {
                        clearInterval(progressInterval);
                        conn.end();
                        
                        if (code !== 0) {
                            reject(new Error('Installation failed with code ' + code));
                            return;
                        }

                        resolve(true);
                    });
                });
            } catch (error) {
                conn.end();
                reject(error);
            }
        });

        conn.on('error', (err) => {
            reject(err);
        });

        conn.connect({
            host,
            port: 22,
            username,
            password,
            readyTimeout: 30000,
            tryKeyboard: false
        });
    });
}

module.exports = {
    installDedicatedRDP
};
