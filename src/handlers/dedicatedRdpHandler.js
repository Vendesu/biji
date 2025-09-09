const { DEDICATED_OS_VERSIONS, DEDICATED_INSTALLATION_COST } = require('../config/constants');

const { checkVPSSupport } = require('../utils/vpsChecker');
const { detectVPSSpecs } = require('../utils/vpsSpecs');
const { installDedicatedRDP } = require('../utils/dedicatedRdpInstaller');

const { deductBalance, isAdmin } = require('../utils/userManager');
const RDPMonitor = require('../utils/rdpMonitor');
const safeMessageEditor = require('../utils/safeMessageEdit');

async function handleInstallDedicatedRDP(bot, chatId, messageId, userSessions) {
  if (!isAdmin(chatId) && !await deductBalance(chatId, DEDICATED_INSTALLATION_COST)) {
    await safeMessageEditor.editMessage(bot, chatId, messageId,
      'Saldo tidak mencukupi untuk Dedicated RDP (Rp 3.000). Silakan deposit terlebih dahulu.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Deposit', callback_data: 'deposit' }, { text: 'Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    return;
  }

  const session = userSessions.get(chatId) || {};
  session.installType = 'dedicated';

  const msg = await bot.editMessageText(
    'Instalasi RDP Dedicated\n\n' +
    'Harga: Rp 3.000\n' +
    'Fitur: Windows langsung di VPS (bukan Docker)\n' +
    'Port: 8765 (custom untuk keamanan)\n\n' +
    'Spesifikasi Minimal:\n' +
    '• CPU: 2 Core\n' +
    '• RAM: 4 GB\n' +
    '• Storage: 40 GB\n\n' +
    'IP VPS:\n' +
    'IP akan dihapus otomatis setelah dikirim\n\n' +
    'PENTING: VPS Wajib Fresh Install Ubuntu 24.04 LTS',
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Batal', callback_data: 'cancel_installation' }]
        ]
      }
    }
  );

  session.step = 'waiting_ip';
  session.startTime = Date.now();
  session.messageId = msg.message_id;
  userSessions.set(chatId, session);
}

async function handleDedicatedVPSCredentials(bot, msg, userSessions) {
  const chatId = msg.chat.id;
  const session = userSessions.get(chatId);

  if (!session || session.installType !== 'dedicated') {
    await bot.sendMessage(chatId, 'Sesi telah kadaluarsa. Silakan mulai dari awal.');
    return;
  }

  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (error) {
    console.log('Gagal menghapus pesan:', error.message);
  }

  switch (session.step) {
    case 'waiting_ip':
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(msg.text)) {
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          'Format IP tidak valid.\n\n' +
          'Instalasi RDP Dedicated\n\n' +
          'IP VPS:\n' +
          'IP akan dihapus otomatis setelah dikirim\n\n' +
          'PENTING: VPS Wajib Fresh Install Ubuntu 24.04 LTS',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Batal', callback_data: 'cancel_installation' }]
              ]
            }
          }
        );
        return;
      }

      session.ip = msg.text;
      session.step = 'waiting_password';
      userSessions.set(chatId, session);

      await safeMessageEditor.editMessage(bot, chatId, session.messageId,
        'Password Root VPS:\nPassword akan dihapus otomatis',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Batal', callback_data: 'cancel_installation' }]
            ]
          }
        }
      );
      break;

    case 'waiting_password':
      session.password = msg.text;
      session.step = 'checking_vps';
      userSessions.set(chatId, session);

      await safeMessageEditor.editMessage(bot, chatId, session.messageId, 'Memeriksa VPS...');

      try {
        const rawSpecs = await detectVPSSpecs(session.ip, 'root', session.password);
        session.rawSpecs = rawSpecs;
        session.hostname = rawSpecs.hostname || 'unknown';

        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          `VPS siap untuk instalasi RDP dedicated\n\n` +
          `Hostname: ${session.hostname}\n\n` +
          `Silakan pilih OS Windows:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Lanjutkan', callback_data: 'show_dedicated_os_selection' }],
                [{ text: 'Batal', callback_data: 'cancel_installation' }]
              ]
            }
          }
        );
      } catch (error) {
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          'Gagal terhubung ke VPS. Pastikan IP dan password benar.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                [{ text: 'Kembali', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        userSessions.delete(chatId);
      }
      break;

    case 'waiting_rdp_password':
      if (msg.text.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@#$%^&+=]{8,}$/.test(msg.text)) {
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          'Password tidak memenuhi syarat. Harus minimal 8 karakter dan mengandung huruf dan angka.\n\n' +
          `Konfigurasi yang dipilih:\n\n` +
          `OS: ${session.selectedOS.name}\n` +
          `Harga: Rp ${session.selectedOS.price.toLocaleString()}\n\n` +
          `Masukkan password untuk RDP Windows:\n` +
          `(Min. 8 karakter, kombinasi huruf dan angka)`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Kembali', callback_data: 'back_to_dedicated_os' }]
              ]
            }
          }
        );
        return;
      }

      session.rdpPassword = msg.text;

      await safeMessageEditor.editMessage(bot, chatId, session.messageId,
        'Memulai instalasi Windows Dedicated...\n\n' +
        'Proses ini akan memakan waktu 30-45 menit.\n\n' +
        'Status: Instalasi sedang berjalan...\n' +
        'Catatan: Anda akan mendapat notifikasi ketika RDP siap!'
      );

      try {
        const installPromise = installDedicatedRDP(session.ip, 'root', session.password, {
          osVersion: session.selectedOS.version,
          password: session.rdpPassword
        });

        const monitor = new RDPMonitor(session.ip, 'root', session.password, session.rdpPassword, 8765);

        setTimeout(async () => {
          try {
            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              'Instalasi Windows sedang berlangsung...\n\n' +
              'Status: Menunggu Windows boot dan RDP siap...\n\n' +
              'Catatan:\n' +
              '• Instalasi berjalan di background\n' +
              '• Anda akan mendapat notifikasi otomatis\n' +
              '• Estimasi: 30-45 menit\n' +
              '• Jangan tutup chat ini!'
            );

            const rdpResult = await monitor.waitForRDPReady(45 * 60 * 1000);
            monitor.disconnect();

            if (rdpResult.success && rdpResult.rdpReady) {
              await safeMessageEditor.editMessage(bot, chatId, session.messageId,
                `RDP Windows SUDAH SIAP DIGUNAKAN!\n\n` +
                `Status: AKTIF dan siap connect\n\n` +
                `Detail Server:\n` +
                `Hostname: ${session.hostname}\n` +
                `OS: ${session.selectedOS.name}\n` +
                `Server: ${session.ip}:8765\n` +
                `Username: administrator\n` +
                `Password: ${session.rdpPassword}\n\n` +
                `Waktu Instalasi: ${rdpResult.totalTime} menit\n` +
                `Port Custom: 8765 (untuk keamanan)\n\n` +
                `STATUS: SIAP DIGUNAKAN SEKARANG!`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: 'Copy Detail RDP', callback_data: `copy_rdp_${session.ip}_${session.rdpPassword}_${session.hostname}` }],
                      [{ text: 'Panduan Koneksi', callback_data: 'rdp_connection_guide' }],
                      [{ text: 'Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                  }
                }
              );

              await bot.sendMessage(
                chatId,
                `Detail Akun RDP Windows - SIAP PAKAI\n\n` +
                `Hostname: ${session.hostname}\n` +
                `Server: ${session.ip}:8765\n` +
                `Username: administrator\n` +
                `Password: ${session.rdpPassword}\n\n` +
                `Cara Koneksi RDP:\n` +
                `1. Buka Remote Desktop Connection\n` +
                `2. Masukkan: ${session.ip}:8765\n` +
                `3. Username: administrator\n` +
                `4. Password: ${session.rdpPassword}\n` +
                `5. Connect dan enjoy!\n\n` +
                `Tips Penting:\n` +
                `• RDP SUDAH SIAP digunakan sekarang!\n` +
                `• Port 8765 untuk keamanan ekstra\n` +
                `• Simpan detail ini untuk akses selanjutnya\n` +
                `• Tunggu 15 menit jika masih ada masalah, cek berkala\n\n` +
                `Server telah diverifikasi dan 100% ready!`,
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: 'Copy Server', callback_data: `copy_server_${session.ip}:8765` }],
                      [{ text: 'Copy Password', callback_data: `copy_pass_${session.rdpPassword}` }],
                      [{ text: 'Copy Hostname', callback_data: `copy_hostname_${session.hostname}` }]
                    ]
                  }
                }
              );
            } else {
              await safeMessageEditor.editMessage(bot, chatId, session.messageId,
                `Instalasi Selesai tapi RDP Belum Siap\n\n` +
                `Status: ${rdpResult.message}\n\n` +
                `Hostname: ${session.hostname}\n` +
                `OS: ${session.selectedOS.name}\n` +
                `IP: ${session.ip}:8765\n` +
                `Username: administrator\n` +
                `Password: ${session.rdpPassword}\n\n` +
                `Total Waktu: ${rdpResult.totalTime} menit\n\n` +
                `Langkah Selanjutnya:\n` +
                `• Windows mungkin masih finishing boot\n` +
                `• Tunggu 15 menit lagi, cek berkala\n` +
                `• Coba connect RDP secara manual\n` +
                `• Hubungi support jika masih bermasalah`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: 'Test RDP Manual', callback_data: `test_rdp_${session.ip}_8765` }],
                      [{ text: 'Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                  }
                }
              );
            }
          } catch (monitorError) {
            console.error('Error monitoring RDP:', monitorError);

            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              'Instalasi Selesai\n\n' +
              `Hostname: ${session.hostname}\n` +
              `OS: ${session.selectedOS.name}\n` +
              `IP: ${session.ip}:8765\n` +
              `Username: administrator\n` +
              `Password: ${session.rdpPassword}\n\n` +
              `Tunggu 15 menit jika masih ada masalah, cek berkala`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Test RDP Manual', callback_data: `test_rdp_${session.ip}_8765` }],
                    [{ text: 'Kembali ke Menu', callback_data: 'back_to_menu' }]
                  ]
                }
              }
            );

            safeMessageEditor.clearMessageCache(chatId, session.messageId);
            userSessions.delete(chatId);
          }
        }, 120000);

      } catch (error) {
        console.error('Error instalasi dedicated:', error);

        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          'Gagal menginstall Windows Dedicated\n\n' +
          `Error: ${error.message || 'Unknown error'}\n\n` +
          'Kemungkinan penyebab:\n' +
          '• Koneksi ke VPS terputus\n' +
          '• VPS tidak memenuhi requirement\n' +
          '• Masalah dengan script instalasi\n\n' +
          'Silakan coba lagi dengan VPS yang berbeda.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                [{ text: 'Kembali ke Menu', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );

        safeMessageEditor.clearMessageCache(chatId, session.messageId);
        userSessions.delete(chatId);
      }
      break;
  }
}

async function showDedicatedOSSelection(bot, chatId, messageId) {
  const keyboard = [];

  if (!DEDICATED_OS_VERSIONS || !Array.isArray(DEDICATED_OS_VERSIONS)) {
    console.error('DEDICATED_OS_VERSIONS tidak terdefinisi atau bukan array');
    await safeMessageEditor.editMessage(bot, chatId, messageId,
      'Terjadi kesalahan sistem. OS versions tidak terdefinisi.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    return;
  }

  let messageText = 'Pilih OS Windows untuk RDP Dedicated:\n\n';

  DEDICATED_OS_VERSIONS.forEach(os => {
    messageText += `${os.id}. ${os.name} (Rp ${os.price.toLocaleString()})\n`;
    keyboard.push([{
      text: `${os.id}. ${os.name}`,
      callback_data: `dedicated_os_${os.id}`
    }]);
  });

  keyboard.push([{ text: 'Kembali', callback_data: 'back_to_menu' }]);

  await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, {
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function handleDedicatedOSSelection(bot, query, userSessions) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const session = userSessions.get(chatId);

  if (!session) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Sesi telah kadaluarsa. Silakan mulai dari awal.',
      show_alert: true
    });
    return;
  }

  const osId = parseInt(query.data.split('_')[2]);
  const selectedOS = DEDICATED_OS_VERSIONS.find(os => os.id === osId);

  if (!selectedOS) {
    await bot.answerCallbackQuery(query.id, {
      text: 'OS tidak valid. Silakan pilih kembali.',
      show_alert: true
    });
    return;
  }

  session.selectedOS = selectedOS;
  session.step = 'waiting_rdp_password';
  userSessions.set(chatId, session);

  await safeMessageEditor.editMessage(bot, chatId, messageId,
    `Konfigurasi yang dipilih:\n\n` +
    `Hostname: ${session.hostname}\n` +
    `OS: ${selectedOS.name}\n` +
    `Harga: Rp ${selectedOS.price.toLocaleString()}\n\n` +
    `Masukkan password untuk RDP Windows:\n` +
    `(Min. 8 karakter, kombinasi huruf dan angka)`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Kembali', callback_data: 'back_to_dedicated_os' }]
        ]
      }
    }
  );
}

async function handleRDPCallbacks(bot, query, userSessions) {
  const callbackData = query.data;

  if (callbackData.startsWith('copy_rdp_')) {
    const parts = callbackData.split('_');
    const ip = parts[2];
    const password = parts[3];
    const hostname = parts[4] || 'unknown';

    await bot.answerCallbackQuery(query.id, {
      text: `RDP Details:\n\nHostname: ${hostname}\nServer: ${ip}:8765\nUsername: administrator\nPassword: ${password}\n\nDetail sudah ditampilkan!`,
      show_alert: true
    });
  }
  else if (callbackData.startsWith('copy_server_')) {
    const server = callbackData.replace('copy_server_', '');

    await bot.answerCallbackQuery(query.id, {
      text: `Server: ${server}\n\nCopy alamat server ini`,
      show_alert: true
    });
  }
  else if (callbackData.startsWith('copy_pass_')) {
    const password = callbackData.replace('copy_pass_', '');

    await bot.answerCallbackQuery(query.id, {
      text: `Password: ${password}\n\nCopy password ini`,
      show_alert: true
    });
  }
  else if (callbackData.startsWith('copy_hostname_')) {
    const hostname = callbackData.replace('copy_hostname_', '');

    await bot.answerCallbackQuery(query.id, {
      text: `Hostname: ${hostname}\n\nCopy hostname ini`,
      show_alert: true
    });
  }
  else if (callbackData === 'rdp_connection_guide') {
    await bot.answerCallbackQuery(query.id, {
      text: 'Panduan Koneksi RDP:\n\n1. Buka Remote Desktop Connection\n2. Masukkan IP:Port (contoh: 1.2.3.4:8765)\n3. Username: administrator\n4. Password: [your password]\n5. Connect dan enjoy!',
      show_alert: true
    });
  }
  else if (callbackData.startsWith('test_rdp_')) {
    const parts = callbackData.split('_');
    const ip = parts[2];
    const port = parts[3];

    try {
      const monitor = new RDPMonitor(ip, '', '', '', parseInt(port));
      const testResult = await monitor.testRDPConnection();

      await bot.answerCallbackQuery(query.id, {
        text: `Test RDP ${ip}:${port}\n\n${testResult.success ? 'RDP Siap!' : 'RDP Belum Siap'}\n\n${testResult.message}`,
        show_alert: true
      });
    } catch (error) {
      await bot.answerCallbackQuery(query.id, {
        text: `Error testing RDP: ${error.message}`,
        show_alert: true
      });
    }
  }
}

module.exports = {
  handleInstallDedicatedRDP,
  handleDedicatedVPSCredentials,
  showDedicatedOSSelection,
  handleDedicatedOSSelection,
  handleRDPCallbacks
};