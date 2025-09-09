function createMainMenu(isAdmin = false, hasPendingPayment = false) {
    const keyboard = [
        [
            { text: '🖥️ Install RDPmu', callback_data: 'install_rdp' },
            { text: '💰 Deposit', callback_data: 'deposit' }
        ],
        [
            { text: '📚 Tutorial', callback_data: 'tutorial' },
            { text: '❓ FAQ', callback_data: 'faq' }
        ],
        [
            { text: '🏢 Provider', callback_data: 'providers' }
        ]
    ];

    if (hasPendingPayment) {
        keyboard.splice(1, 0, [
            { text: '📋 Tagihan Pembayaran Kamu', callback_data: 'check_pending_payment' }
        ]);
    }

    if (isAdmin) {
        keyboard.splice(1, 0, [
            { text: '💳 Tambah Saldo', callback_data: 'add_balance' },
            { text: '📢 Broadcast', callback_data: 'broadcast' }
        ], [
            { text: '📊 Database', callback_data: 'manage_db' }
        ]);
    }

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

module.exports = {
    createMainMenu
};
