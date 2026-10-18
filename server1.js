const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory databases
const sessions = new Map();
const tokens = new Map(); 

const CONFIG = {
  merchantNumber: process.env.MERCHANT_NUMBER || '7259043',
  plans: {
    pro:   { price: 18000, days: 30,  label: 'Pro'   },
    ultra: { price: 45000, days: 90,  label: 'Ultra' }
  }
};

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 1. Create Session
app.post('/session', async (req, res) => {
  const { merchantNumber, plan, phone, deviceId } = req.body || {};
  
  if (merchantNumber !== CONFIG.merchantNumber) return res.status(400).json({ error: 'Bad merchant' });
  if (!CONFIG.plans[plan]) return res.status(400).json({ error: 'Bad plan' });
  
  const sessionId = 'sess_' + crypto.randomBytes(8).toString('hex');
  
  const sessionData = {
    sessionId,
    plan,
    phone: String(phone),
    deviceId: deviceId || 'unknown',
    status: 'pending'
  };

  const hasAirtelKeys = process.env.AIRTEL_CLIENT_ID && process.env.AIRTEL_CLIENT_SECRET;

  if (hasAirtelKeys) {
    try {
      console.log(`\n[REAL AIRTEL] Triggering USSD prompt to ${phone}`);
      sessions.set(sessionId, sessionData);
      return res.json({ sessionId, status: 'pending' });
    } catch (err) {
      return res.status(500).json({ error: 'Airtel API failed' });
    }
  } else {
    console.log(`\n[MOCK PAYMENT] Plan: ${plan} | Auto-paying in 10s...`);
    sessionData.confirmAt = Date.now() + 10000;
    sessions.set(sessionId, sessionData);
    return res.json({ sessionId, status: 'pending' });
  }
});

// 2. Verify Session
app.get('/verify', (req, res) => {
  const s = sessions.get(req.query.session);
  if (!s) return res.status(404).json({ status: 'failed' });

  if (s.status === 'pending' && s.confirmAt && Date.now() >= s.confirmAt) {
    s.status = 'paid';
    s.tier = s.plan;
    s.expiresAt = Date.now() + (CONFIG.plans[s.plan].days * 24 * 60 * 60 * 1000);
    
    s.token = generateToken();
    tokens.set(s.token, { tier: s.plan, duration: CONFIG.plans[s.plan].days, used: false, issuedTo: s.phone, deviceId: s.deviceId });
    console.log(`[MOCK PAYMENT SUCCESS] Generated Token: ${s.token}`);
  }
  
  res.json({ status: s.status, tier: s.tier, expiresAt: s.expiresAt, token: s.token });
});

// 3. Airtel Webhook Callback
app.post('/airtel-callback', (req, res) => {
  const { transaction } = req.body || {};
  
  if (!transaction || !transaction.id) return res.status(400).send('Bad Request');

  const sessionId = transaction.id;
  const status = transaction.status_code === 'TS' ? 'paid' : 'failed';
  const s = sessions.get(sessionId);
  
  if (!s) return res.status(404).send('Session not found');

  if (status === 'paid') {
    s.status = 'paid';
    s.tier = s.plan;
    s.expiresAt = Date.now() + (CONFIG.plans[s.plan].days * 24 * 60 * 60 * 1000);
    s.token = generateToken();
    tokens.set(s.token, { tier: s.plan, duration: CONFIG.plans[s.plan].days, used: false, issuedTo: s.phone, deviceId: s.deviceId });
    console.log(`\n[AIRTEL WEBHOOK] Payment SUCCESS! Token generated for ${s.phone}`);
  } else {
    s.status = 'failed';
    console.log(`\n[AIRTEL WEBHOOK] Payment FAILED for ${s.phone}`);
  }

  res.status(200).send('OK');
});

// 4. Validate Token (Strict Device Check)
app.get('/validate-token', (req, res) => {
  const { token, deviceId } = req.query;
  const t = tokens.get(token);
  
  if (!t) return res.json({ ok: false, reason: 'Token not found.' });
  if (t.used) return res.json({ ok: false, reason: 'Token already used.' });
  
  // STRICT CHECK: Does the requesting device match the token's device?
  if (t.deviceId !== deviceId) {
    return res.json({ ok: false, reason: 'This token belongs to another device.' });
  }
  
  res.json({ ok: true, tier: t.tier, duration: t.duration });
});

// 5. Manual Device Activation (Admin Only)
app.post('/admin/activate', (req, res) => {
  const { adminSecret, deviceId, plan } = req.body || {};
  const secret = process.env.ADMIN_SECRET || 'super-secret-key';
  
  if (adminSecret !== secret) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!CONFIG.plans[plan]) {
    return res.status(400).json({ error: 'Invalid plan (use pro or ultra)' });
  }

  const newToken = generateToken();
  
  tokens.set(newToken, {
    tier: plan,
    duration: CONFIG.plans[plan].days,
    used: false,
    issuedTo: 'manual-admin',
    deviceId: deviceId
  });

  console.log(`\n[ADMIN] Manually generated ${plan} token for device: ${deviceId}`);

  res.json({ ok: true, message: `Token generated for ${plan}`, token: newToken });
});

app.get('/', (req, res) => {
  res.json({ service: 'GM Notes Server', status: 'running' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GM Notes Server running on port ${PORT}`);
});