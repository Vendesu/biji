const { WINDOWS_VERSIONS } = require('./windows');
const { VPS_CONFIGS, INSTALLATION_COST, DEDICATED_INSTALLATION_COST } = require('./vps');

// Dedicated OS versions untuk installation langsung ke VPS
const DEDICATED_OS_VERSIONS = [
    { id: 1, name: 'Windows 10 Pro', version: 'win_10', price: 3000 },
    { id: 2, name: 'Windows Server 2022', version: 'win_22', price: 3000 },
    { id: 3, name: 'Windows Server 2019', version: 'win_19', price: 3000 },
    { id: 4, name: 'Windows Server 2012', version: 'win_12', price: 3000 }
];

module.exports = {
    WINDOWS_VERSIONS,
    VPS_CONFIGS,
    INSTALLATION_COST,
    DEDICATED_INSTALLATION_COST,
    DEDICATED_OS_VERSIONS
};
