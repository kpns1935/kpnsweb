const twilio = require('twilio');

// Optional Twilio setup via environment variables or direct config
const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';
const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

async function sendWhatsAppSlip({ phone, memberName, receiptNo, amount, type, date, mediaUrl, note }) {
  // Format phone number to international standard if missing
  let formattedPhone = phone.replace(/[^0-9+]/g, '');
  if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+91' + formattedPhone; // Default to India (+91)
  }

  const messageText = 
    `🚩 *KPNS Organization Transaction Receipt*\n\n` +
    `Dear ${memberName},\n` +
    `Your transaction has been successfully recorded.\n\n` +
    `📋 *Receipt No:* ${receiptNo}\n` +
    `💰 *Amount:* ₹${amount.toLocaleString('en-IN')}\n` +
    `📌 *Type:* ${type}\n` +
    `📅 *Date:* ${date}\n` +
    (note ? `📝 *Note:* ${note}\n` : '') +
    `\nThank you for your support to KPNS Organization!`;

  if (client) {
    try {
      const payload = {
        from: fromWhatsAppNumber,
        to: `whatsapp:${formattedPhone}`,
        body: messageText
      };
      if (mediaUrl) {
        payload.mediaUrl = [mediaUrl];
      }
      const response = await client.messages.create(payload);
      return { success: true, sid: response.sid, simulated: false };
    } catch (err) {
      console.error('Twilio WhatsApp error:', err.message);
      return { success: false, error: err.message, simulated: true };
    }
  } else {
    // Simulated log fallback
    console.log('\n--- [SIMULATED WHATSAPP MESSAGE] ---');
    console.log(`To: whatsapp:${formattedPhone}`);
    console.log(`Body:\n${messageText}`);
    if (mediaUrl) console.log(`Media URL: ${mediaUrl}`);
    console.log('------------------------------------\n');

    return { 
      success: true, 
      simulated: true, 
      message: 'Twilio credentials not set. Message logged in console / generated direct WhatsApp web link.' 
    };
  }
}

module.exports = {
  sendWhatsAppSlip
};
