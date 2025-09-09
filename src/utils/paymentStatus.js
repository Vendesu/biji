const { checkPaymentStatus, isPaymentStatusSuccessful } = require('./payment');
const BalanceManager = require('../handlers/balanceHandler');
const PaymentTracker = require('./paymentTracker');

async function handlePaymentStatus(bot, chatId, messageId, transactionId, amount, maxRetries = 60) {
  let retryCount = 0;
  const retryInterval = 10000;

  const checkStatus = async () => {
    try {
      const statusResult = await checkPaymentStatus(process.env.ATLANTIS_API_KEY, transactionId);

      if (statusResult.success || isPaymentStatusSuccessful(statusResult)) {
        const status = statusResult.data?.status || statusResult.status;
        console.log('Payment status:', status);

        // Sesuai permintaan: status 'processing' akan dikonfirmasi sebagai deposit berhasil
        if (['success', 'settlement', 'capture', 'paid', 'processing'].includes(status?.toLowerCase())) {
          try {
            await BalanceManager.updateBalance(chatId, amount);
            await PaymentTracker.removePendingPayment(transactionId);

            const statusText = status?.toLowerCase() === 'processing' ? 'Diproses' : 'Berhasil';

            await bot.editMessageText(
              `✅ **Pembayaran ${statusText}!**\n\n` +
              `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
              `💎 **Saldo berhasil ditambahkan ke akun Anda**\n\n` +
              `📅 **Waktu:** ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
              `📋 **Status:** ${statusText}\n\n` +
              `🎉 **Terima kasih atas pembayaran Anda!**`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }
                  ]]
                }
              }
            );
            return;
          } catch (balanceError) {
            console.error('Error updating balance:', balanceError);
            
            // Tetap tampilkan pesan sukses meskipun ada error update balance
            await bot.editMessageText(
              `⚠️ **Pembayaran Berhasil - Perlu Verifikasi Manual**\n\n` +
              `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
              `📋 **Status:** ${status}\n` +
              `❗ **Info:** Saldo mungkin butuh update manual\n\n` +
              `📞 **Hubungi admin jika saldo belum bertambah.**`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }
                  ]]
                }
              }
            );
            return;
          }
        }

        // Status masih pending
        else if (['pending', 'created'].includes(status?.toLowerCase())) {
          console.log(`Payment status: ${status} - continuing to monitor`);
        }

        // Status gagal
        else if (['failed', 'cancelled', 'expired', 'deny', 'error'].includes(status?.toLowerCase())) {
          await PaymentTracker.removePendingPayment(transactionId);
          await bot.editMessageText(
            `❌ **Pembayaran Gagal**\n\n` +
            `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
            `📋 **Status:** ${status}\n` +
            `⏰ **Waktu:** ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
            `💡 **Silakan coba lagi untuk melakukan deposit.**`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Coba Lagi', callback_data: 'deposit' }],
                  [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                ]
              }
            }
          );
          return;
        }
      } else {
        console.log('Payment status check failed:', statusResult.error);
      }

      retryCount++;
      if (retryCount < maxRetries) {
        setTimeout(checkStatus, retryInterval);
      } else {
        await bot.editMessageText(
          `⏰ **Monitoring Pembayaran Dihentikan**\n\n` +
          `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
          `📋 **Status:** Monitoring timeout setelah ${Math.round(maxRetries * retryInterval / 60000)} menit\n\n` +
          `💡 **Catatan:**\n` +
          `• Jika sudah membayar, saldo akan otomatis masuk\n` +
          `• Gunakan "Cek Status" untuk monitoring manual\n` +
          `• Hubungi support jika ada kendala`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔍 Cek Status', callback_data: 'pending_payment' }],
                [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );
      }

    } catch (error) {
      console.error('Error checking payment status:', error);
      retryCount++;
      if (retryCount < maxRetries) {
        setTimeout(checkStatus, retryInterval);
      } else {
        await bot.editMessageText(
          `❌ **Error Monitoring Pembayaran**\n\n` +
          `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
          `📋 **Error:** ${error.message}\n\n` +
          `💡 **Silakan coba cek status manual atau hubungi support.**`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔍 Cek Status', callback_data: 'pending_payment' }],
                [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );
      }
    }
  };

  // Mulai pengecekan setelah 10 detik
  setTimeout(checkStatus, 10000);
}

module.exports = {
  handlePaymentStatus
};