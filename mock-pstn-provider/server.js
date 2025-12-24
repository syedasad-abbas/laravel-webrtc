import express from 'express';
import fetch from 'node-fetch';
import { nanoid } from 'nanoid';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN || '';
const CALLBACK_DELAY_MS = Number(process.env.CALLBACK_DELAY_MS || 1500);

const calls = [];

function log(message, detail) {
  if (detail) {
    console.log(`[mock-pstn] ${message}`, detail);
  } else {
    console.log(`[mock-pstn] ${message}`);
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', calls: calls.length });
});

app.get('/calls', (_req, res) => {
  res.json({ calls });
});

app.post('/dial', async (req, res) => {
  if (PROVIDER_TOKEN) {
    const authHeader = req.header('authorization') || '';
    if (authHeader !== `Bearer ${PROVIDER_TOKEN}`) {
      log('Rejected request due to missing/invalid token');
      return res.status(401).json({ message: 'Invalid provider token.' });
    }
  }

  const { to, from, room, callback_url: callbackUrl } = req.body || {};

  if (!to) {
    log('Rejected request missing destination number');
    return res.status(422).json({ message: 'Destination number (to) is required.' });
  }

  const callRecord = {
    id: nanoid(),
    to,
    from,
    room,
    receivedAt: new Date().toISOString()
  };

  calls.unshift(callRecord);
  log('Accepted dial request', callRecord);

  if (callbackUrl) {
    setTimeout(() => sendCallback(callbackUrl, callRecord), CALLBACK_DELAY_MS);
  }

  res.json({
    status: 'accepted',
    call_id: callRecord.id,
    message: `Dial to ${to} accepted by mock provider.`
  });
});

async function sendCallback(url, callRecord) {
  try {
    log('Sending callback', { url, callId: callRecord.id });
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'call-connected',
        call_id: callRecord.id,
        room: callRecord.room,
        to: callRecord.to,
        from: callRecord.from,
        connected_at: new Date().toISOString()
      })
    });
  } catch (error) {
    log('Failed to deliver callback', { message: error.message, url });
  }
}

app.listen(PORT, () => {
  log(`listening on :${PORT}`);
});
