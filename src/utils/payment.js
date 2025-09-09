const axios = require('axios');

const ATLANTIS_BASE_URL = 'https://atlantich2h.com';

async function createPayment(apiKey, reffId, amount) {
  try {
    console.log('Creating payment with new endpoint:', {
      apiKey: apiKey ? '***' : 'undefined',
      reffId,
      amount
    });

    // Sesuaikan dengan spesifikasi baru
    const response = await axios({
      method: 'POST',
      url: `${ATLANTIS_BASE_URL}/deposit/create`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: new URLSearchParams({
        api_key: apiKey,
        reff_id: reffId,
        nominal: amount.toString(),
        type: 'ewallet',
        metode: 'qris'
      }),
      timeout: 30000
    });

    console.log('Payment API Response:', {
      status: response.status,
      data: response.data
    });

    // Sesuaikan dengan format response baru
    if (response.data && response.data.status === true) {
      return {
        success: true,
        data: {
          id: response.data.data.id,
          reff_id: response.data.data.reff_id,
          nominal: response.data.data.nominal,
          tambahan: response.data.data.tambahan || 0,
          fee: response.data.data.fee || 0,
          get_balance: response.data.data.get_balance || amount,
          qr_string: response.data.data.qr_string,
          qr_image: response.data.data.qr_image,
          status: response.data.data.status,
          created_at: response.data.data.created_at,
          expired_at: response.data.data.expired_at
        }
      };
    } else {
      return {
        success: false,
        error: response.data?.message || 'Payment creation failed'
      };
    }

  } catch (error) {
    console.error('Payment creation error:', error.message);
    
    if (error.response) {
      console.error('Error response:', error.response.data);
      return {
        success: false,
        error: error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

async function checkPaymentStatus(apiKey, transactionId) {
  try {
    // Implementasi check status sesuai dengan API Atlantis
    // Sesuaikan endpoint jika ada endpoint khusus untuk check status
    const response = await axios({
      method: 'POST',
      url: `${ATLANTIS_BASE_URL}/deposit/status`, // Sesuaikan jika ada endpoint berbeda
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: new URLSearchParams({
        api_key: apiKey,
        id: transactionId
      }),
      timeout: 15000
    });

    if (response.data && response.data.status === true) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        error: response.data?.message || 'Failed to check payment status'
      };
    }

  } catch (error) {
    console.error('Check payment status error:', error.message);
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

function isPaymentStatusSuccessful(status) {
  return status === 'success' || status === 'paid' || status === 'completed';
}

module.exports = {
  createPayment,
  checkPaymentStatus,
  isPaymentStatusSuccessful
};
