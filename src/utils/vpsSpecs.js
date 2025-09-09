const { Client } = require('ssh2');

async function detectVPSSpecs(host, username, password) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        
        conn.on('ready', () => {
            const commands = [
                'nproc', // CPU cores
                'free -g | awk \'/^Mem:/{print $2}\'', // RAM in GB
                'df -BG / | awk \'NR==2{print $4}\' | sed \'s/G//\'' // Available disk in GB
            ];

            let specs = {};
            let completed = 0;

            commands.forEach((cmd, index) => {
                conn.exec(cmd, (err, stream) => {
                    if (err) {
                        conn.end();
                        reject(err);
                        return;
                    }

                    let output = '';
                    stream.on('data', (data) => {
                        output += data.toString().trim();
                    });

                    stream.on('close', () => {
                        const value = parseInt(output) || 0;
                        
                        switch (index) {
                            case 0:
                                specs.cpu = value;
                                break;
                            case 1:
                                specs.ram = value;
                                break;
                            case 2:
                                specs.storage = value;
                                break;
                        }

                        completed++;
                        if (completed === commands.length) {
                            conn.end();
                            resolve(specs);
                        }
                    });
                });
            });
        });

        conn.on('error', (err) => {
            reject(err);
        });

        conn.connect({
            host,
            port: 22,
            username,
            password,
            readyTimeout: 10000
        });
    });
}

module.exports = {
    detectVPSSpecs
};
