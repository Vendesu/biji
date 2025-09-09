require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { scheduleJob } = require('node-schedule');
const { handleInstallRDP, handleInstallDockerRDP, handleVPSCredentials, handleWindowsSelection, showWindowsSelection, handlePageNavigation, handleCancelInstallation } = require('./handlers/rdpHandler');
const { handleInstallDedicatedRDP, handleDedicatedVPSCredentials, showDedicatedOSSelection, handleDedicatedOSSelection } = require('./handlers/dedicatedRdpHandler');
const { handleDeposit, handleDepositAmount, handlePendingPayment } = require('./handlers/depositHandler');
const { handleAddBalance, processAddBalance, handleBroadcast, processBroadcast } = require('./handlers/adminHandler');
const { handleFAQ } = require('./handlers/faqHandler');
const { handleTutorial } = require('./handlers/tutorialHandler');
const { handleProviders } = require('./handlers/providerHandler');
const { getUser, isAdmin, getBalance } = require('./utils/userManager');
const { createMainMenu } = require('./utils/keyboard');
const PaymentTracker = require('./utils/paymentTracker');
const DatabaseBackup = require('./utils/dbBackup');
const { getUptime } = require('./utils/uptime');
const safeMessageEditor = require('./utils/safeMessageEdit');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const userSessions = new Map();
const adminSessions = new Map();
const depositSessions = new Map();

const dbBackup = new DatabaseBackup(bot);

console.log('🤖 RDP Installation Bot started successfully!');
console.log(`📅 Started at: ${new Date().toLocaleString('id-ID')}`);

scheduleJob('0 */6 * * *', () => {
    PaymentTracker.cleanupExpiredPayments();
    console.log('🧹 Cleaned up expired payments');
});

dbBackup.scheduleBackup();

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await getUser(chatId);
        const balance = await getBalance(chatId);
        const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
        const isUserAdmin = isAdmin(chatId);

        const welcomeMessage = `🎉 *Selamat datang di RDP Installation Bot!*\n\n` +
            `👋 Halo ${msg.from.first_name || 'User'}!\n\n` +
            `💰 *Saldo:* ${typeof balance === 'string' ? balance : `Rp ${balance.toLocaleString()}`}\n\n` +
            `🚀 *Layanan Tersedia:*\n` +
            `• 🐳 Docker RDP - Rp 1.000/install\n` +
            `• 🖥️ Dedicated RDP - Rp 3.000/install\n` +
            `• 💰 Deposit saldo otomatis\n` +
            `• 📚 Tutorial lengkap\n` +
            `• 🏢 Rekomendasi provider VPS\n\n` +
            `⏰ Uptime: ${getUptime()}`;

        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            ...createMainMenu(isUserAdmin, !!pendingPayment)
        });
    } catch (error) {
        console.error('Start command error:', error);
        await bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
    }
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const user = await getUser(chatId);
        const balance = await getBalance(chatId);
        const pendingPayment = await PaymentTracker.getPendingPayment(chatId);

        const statusMessage = `📊 *Status Akun*\n\n` +
            `👤 User ID: \`${chatId}\`\n` +
            `💰 Saldo: ${typeof balance === 'string' ? balance : `Rp ${balance.toLocaleString()}`}\n` +
            `📅 Bergabung: ${new Date(user.created_at).toLocaleDateString('id-ID')}\n` +
            `📋 Tagihan: ${pendingPayment ? '🟡 Ada' : '🟢 Tidak ada'}\n\n` +
            `⏰ Bot Uptime: ${getUptime()}`;

        await bot.sendMessage(chatId, statusMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🏠 Menu Utama', callback_data: 'back_to_menu' }
                ]]
            }
        });
    } catch (error) {
        console.error('Status command error:', error);
        await bot.sendMessage(chatId, '❌ Gagal mengambil status akun.');
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
        if (data === 'back_to_menu') {
            userSessions.delete(chatId);
            adminSessions.delete(chatId);
            depositSessions.delete(chatId);

            const balance = await getBalance(chatId);
            const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
            const isUserAdmin = isAdmin(chatId);

            const welcomeMessage = `🎉 *Selamat datang di RDP Installation Bot!*\n\n` +
                `👋 Halo ${query.from.first_name || 'User'}!\n\n` +
                `💰 *Saldo:* ${typeof balance === 'string' ? balance : `Rp ${balance.toLocaleString()}`}\n\n` +
                `🚀 *Layanan Tersedia:*\n` +
                `• 🐳 Docker RDP - Rp 1.000/install\n` +
                `• 🖥️ Dedicated RDP - Rp 3.000/install\n` +
                `• 💰 Deposit saldo otomatis\n` +
                `• 📚 Tutorial lengkap\n` +
                `• 🏢 Rekomendasi provider VPS\n\n` +
                `⏰ Uptime: ${getUptime()}`;

            await safeMessageEditor.editMessage(bot, chatId, messageId, welcomeMessage, {
                ...createMainMenu(isUserAdmin, !!pendingPayment)
            });
        }
        else if (data === 'install_rdp') {
            await handleInstallRDP(bot, chatId, messageId, userSessions);
        }
        else if (data === 'install_docker_rdp') {
            await handleInstallDockerRDP(bot, chatId, messageId, userSessions);
        }
        else if (data === 'install_dedicated_rdp') {
            await handleInstallDedicatedRDP(bot, chatId, messageId, userSessions);
        }
        else if (data === 'show_windows_selection') {
            await showWindowsSelection(bot, chatId, messageId, 0);
        }
        else if (data.startsWith('windows_')) {
            await handleWindowsSelection(bot, query, userSessions);
        }
        else if (data.startsWith('page_')) {
            await handlePageNavigation(bot, query, userSessions);
        }
        else if (data === 'back_to_windows') {
            await showWindowsSelection(bot, chatId, messageId, 0);
        }
        else if (data === 'show_dedicated_os_selection') {
            await showDedicatedOSSelection(bot, chatId, messageId);
        }
        else if (data.startsWith('dedicated_os_')) {
            await handleDedicatedOSSelection(bot, query, userSessions);
        }
        else if (data === 'back_to_dedicated_os') {
            await showDedicatedOSSelection(bot, chatId, messageId);
        }
        else if (data === 'continue_no_kvm') {
            await showWindowsSelection(bot, chatId, messageId, 0);
        }
        else if (data === 'cancel_installation') {
            await handleCancelInstallation(bot, query, userSessions);
        }
        else if (data === 'deposit') {
            const session = await handleDeposit(bot, chatId, messageId);
            depositSessions.set(chatId, session);
        }
        else if (data === 'check_pending_payment') {
            await handlePendingPayment(bot, chatId, messageId);
        }
        else if (data === 'tutorial') {
            await handleTutorial(bot, chatId, messageId);
        }
        else if (data === 'faq') {
            await handleFAQ(bot, chatId, messageId);
        }
        else if (data === 'providers') {
            await handleProviders(bot, chatId, messageId);
        }
        else if (data === 'add_balance') {
            if (isAdmin(chatId)) {
                await handleAddBalance(bot, chatId, messageId);
                adminSessions.set(chatId, { action: 'add_balance' });
            }
        }
        else if (data === 'broadcast') {
            if (isAdmin(chatId)) {
                await handleBroadcast(bot, chatId, messageId);
                adminSessions.set(chatId, { action: 'broadcast' });
            }
        }
        else if (data === 'manage_db') {
            if (isAdmin(chatId)) {
                await dbBackup.handleManageDatabase(chatId, messageId);
            }
        }
        else if (data === 'backup_now') {
            if (isAdmin(chatId)) {
                await safeMessageEditor.editMessage(bot, chatId, messageId, '📥 Mengirim backup database...');
                await dbBackup.sendBackupToAdmin();
                await safeMessageEditor.editMessage(bot, chatId, messageId, '✅ Backup database berhasil dikirim!', {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '« Kembali', callback_data: 'back_to_menu' }
                        ]]
                    }
                });
            }
        }
        // TAMBAHAN CODE UNTUK CHECK RDP STATUS
        else if (data.startsWith('check_rdp_')) {
            const [, , ip, port] = data.split('_');
            const RDPMonitor = require('./utils/rdpMonitor');
            
            try {
                await safeMessageEditor.editMessage(bot, chatId, messageId, '🔍 Mengecek status RDP...');

                const monitor = new RDPMonitor(ip, 'root', 'dummy'); // password tidak diperlukan untuk cek port
                const rdpStatus = await monitor.checkRDPPort(parseInt(port));
                monitor.disconnect();

                if (rdpStatus) {
                    await safeMessageEditor.editMessage(bot, chatId, messageId,
                        `✅ **Status RDP: AKTIF**\n\n` +
                        `🌐 Server: ${ip}:${port}\n` +
                        `🔌 Port RDP: Dapat diakses\n` +
                        `🎯 Status: Siap digunakan!\n\n` +
                        `💡 Anda sekarang dapat terhubung ke RDP server.`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '« Kembali ke Menu', callback_data: 'back_to_menu' }
                                ]]
                            }
                        }
                    );
                } else {
                    await safeMessageEditor.editMessage(bot, chatId, messageId,
                        `⚠️ **Status RDP: BELUM SIAP**\n\n` +
                        `🌐 Server: ${ip}:${port}\n` +
                        `🔌 Port RDP: Tidak dapat diakses\n` +
                        `⏳ Status: Masih booting...\n\n` +
                        `💡 Silakan tunggu 5-10 menit lagi dan coba kembali.`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔄 Cek Lagi', callback_data: `check_rdp_${ip}_${port}` }],
                                    [{ text: '« Kembali ke Menu', callback_data: 'back_to_menu' }]
                                ]
                            }
                        }
                    );
                }
            } catch (error) {
                await safeMessageEditor.editMessage(bot, chatId, messageId,
                    `❌ **Error saat mengecek status RDP**\n\n` +
                    `Error: ${error.message}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '« Kembali ke Menu', callback_data: 'back_to_menu' }
                            ]]
                        }
                    }
                );
            }
        }

        await bot.answerCallbackQuery(query.id);
    } catch (error) {
        console.error('Callback query error:', error);
        try {
            await bot.answerCallbackQuery(query.id, {
                text: '❌ Terjadi kesalahan. Silakan coba lagi.',
                show_alert: true
            });
        } catch (answerError) {
            console.error('Error answering callback query:', answerError);
        }
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    if (!msg.text) {
        return;
    }

    try {
        const adminSession = adminSessions.get(chatId);
        if (adminSession && isAdmin(chatId)) {
            if (adminSession.action === 'add_balance') {
                await processAddBalance(bot, msg);
                adminSessions.delete(chatId);
                return;
            } else if (adminSession.action === 'broadcast') {
                await processBroadcast(bot, msg);
                adminSessions.delete(chatId);
                return;
            }
        }

        const depositSession = depositSessions.get(chatId);
        if (depositSession && depositSession.step === 'waiting_amount') {
            await handleDepositAmount(bot, msg, depositSession);
            depositSessions.delete(chatId);
            return;
        }

        const rdpSession = userSessions.get(chatId);
        if (rdpSession) {
            if (rdpSession.installType === 'dedicated') {
                await handleDedicatedVPSCredentials(bot, msg, userSessions);
            } else {
                await handleVPSCredentials(bot, msg, userSessions);
            }
            return;
        }

    } catch (error) {
        console.error('Message handler error:', error);
        await bot.sendMessage(chatId, '❌ Terjadi kesalahan. Gunakan /start untuk memulai kembali.');
    }
});

process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down bot gracefully...');
    try {
        await bot.stopPolling();
        safeMessageEditor.clearAllCache(); // Clean up cache on shutdown
        console.log('✅ Bot stopped successfully');
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down...');
    try {
        await bot.stopPolling();
        safeMessageEditor.clearAllCache(); // Clean up cache on shutdown
        console.log('✅ Bot stopped successfully');
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
    }
    process.exit(0);
});

module.exports = { bot, userSessions, adminSessions, depositSessions };
