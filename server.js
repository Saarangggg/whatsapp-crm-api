const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Log incoming requests (excluding frequent status checks)
app.use((req, res, next) => {
  if (req.path !== '/status') {
    log(`${req.method} ${req.path}`);
  }
  next();
});

const PORT = process.env.PORT || 3001;
const WA_SECRET = process.env.WA_SECRET || '';
const CONFIG_FILE = path.join(__dirname, 'automation-config.json');

// Default automation configuration
let automationConfig = {
  enabled: true,
  systemPrompt: 'You are a helpful customer service AI assistant.',
  openRouterApiKey: '',
  model: 'google/gemma-2-9b-it:free'
};

// Load configuration on startup
if (fs.existsSync(CONFIG_FILE)) {
  try {
    automationConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to parse automation-config.json, using defaults:', e.message);
  }
}

// Helper to save configuration
const saveAutomationConfig = () => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(automationConfig, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save automation-config.json:', e.message);
    return false;
  }
};

// Cookie parser helper
const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = parts[1].trim();
    }
  });
  return cookies;
};

// Verify signed token from session cookie
const getAuthenticatedUser = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.wa_session;
  if (!token) return null;

  const parts = token.split('|');
  if (parts.length !== 3) return null;

  const [username, expiry, signature] = parts;
  if (Date.now() > parseInt(expiry, 10)) return null;

  const expectedSignature = crypto
    .createHmac('sha256', process.env.WA_SECRET || 'fallback_secret')
    .update(`${username}|${expiry}`)
    .digest('hex');

  if (signature === expectedSignature && username === (process.env.AUTH_USER || 'admin')) {
    return username;
  }
  return null;
};

// Enforce auth check on API routes (cookie session OR shared secret token)
const authenticateApi = (req, res, next) => {
  // Allow login/logout routes without auth
  if (req.path === '/login' || req.path === '/logout') {
    return next();
  }

  // 1. Check Cookie-based browser session
  if (getAuthenticatedUser(req)) {
    return next();
  }

  // 2. Check Shared secret (for cloud workers / automation backend)
  const secret = process.env.WA_SECRET || '';
  const reqSecret = req.headers['x-wa-secret'] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null) ||
    req.query.secret;

  if (secret && reqSecret === secret) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Authentication required' });
};

// Enforce auth check on UI pages
const authenticateUi = (req, res, next) => {
  if (getAuthenticatedUser(req)) {
    return next();
  }
  res.redirect('/login');
};

// Validate shared secret or cookie session on all /api/* routes
app.use('/api', authenticateApi);

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ─── WhatsApp Client ──────────────────────────────────────────────────────────
let client = null;
let qrCodeData = null;
let isReady = false;

function initWhatsAppClient() {
  if (client) {
    log('Cleaning up existing WhatsApp client...');
    try {
      client.removeAllListeners();
    } catch (e) { }
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.ww-session') }),

    // Never time out waiting for QR / auth — let the retry loop handle failures
    authTimeoutMs: 0,
    qrMaxRetries: 0,           // keep showing QR until scanned
    takeoverOnConflict: true,  // take over if another session exists
    takeoverTimeoutMs: 10000,

    // Cache WA web app locally to prevent slow loading and context destruction
    webVersionCache: {
      type: 'local',
      path: path.join(__dirname, '2.3000.1041627196.html')
    },

    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      ],
      timeout: 0,
      protocolTimeout: 300000,
    },
  });

  client.on('qr', async (qr) => {
    log('QR received — open http://localhost:' + PORT + '/ in browser to scan');
    qrCodeData = await qrcode.toDataURL(qr);
    isReady = false;
  });

  client.on('authenticated', () => {
    log('WhatsApp authenticated');
    qrCodeData = null;
  });

  client.on('ready', () => {
    log('WhatsApp connected and ready!');
    qrCodeData = null;
    isReady = true;
  });

  // Forward incoming chat messages to the Worker Webhook if configured
  client.on('message', async (msg) => {
    try {
      // 1. Forward message to webhook URL
      await forwardToBackend(msg);

      // 2. AI Autoreply if enabled
      if (automationConfig.enabled && (automationConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY)) {
        const senderPhone = msg.from.split('@')[0];
        
        // Skip auto-reply for admin messages to prevent loops
        const adminPhone = (process.env.ADMIN_PHONE || '').replace(/\D/g, '');
        if (adminPhone && (senderPhone === adminPhone || adminPhone.endsWith(senderPhone) || senderPhone.endsWith(adminPhone))) {
          log(`Skipping AI reply for admin message from ${senderPhone}`);
          return;
        }

        await handleAiAutoreply(msg);
      }
    } catch (e) {
      console.error('Failed to handle incoming WhatsApp message:', e.message);
    }
  });

  client.on('auth_failure', (msg) => {
    log('Auth failure: ' + msg);
    isReady = false;
  });

  client.on('disconnected', (reason) => {
    log('WhatsApp disconnected: ' + reason);
    isReady = false;
    _reconnect();
  });
}

// Generate response using OpenRouter and send reply
async function handleAiAutoreply(msg) {
  const apiKey = automationConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  const model = automationConfig.model || 'google/gemma-2-9b-it:free';
  const systemPrompt = automationConfig.systemPrompt || process.env.SYSTEM_PROMPT || 'You are a helpful customer service AI assistant.';
  const senderPhone = msg.from.split('@')[0];
  const userText = (msg.body || msg.caption || '').trim();

  if (!userText) return;

  log(`[AI Autoreply] Generating reply for ${senderPhone} using model ${model}...`);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Title': 'WhatsApp CRM Service'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ]
      })
    });

    if (res.ok) {
      const aiData = await res.json();
      const replyText = aiData?.choices?.[0]?.message?.content;
      if (replyText) {
        await client.sendMessage(msg.from, replyText);
        log(`[AI Autoreply] Sent response to ${senderPhone}: "${replyText.replace(/\n/g, ' ')}"`);
        
        // Forward AI reply to webhook so backend is kept updated
        await forwardToBackend({
          from: (client.info?.wid?._serialized) || 'system@c.us',
          body: replyText,
          type: 'chat',
          hasMedia: false
        });
      } else {
        log(`[AI Autoreply] Empty response from OpenRouter.`);
      }
    } else {
      const errText = await res.text();
      log(`[AI Autoreply] OpenRouter API error: ${res.status} — ${errText}`);
    }
  } catch (err) {
    log(`[AI Autoreply] OpenRouter request failed: ${err.message}`);
  }
}

function _reconnect() {
  log('Reconnecting in 5 s...');
  setTimeout(() => {
    const oldClient = client;
    client = null;
    if (oldClient) {
      oldClient.destroy().catch(() => { }).finally(() => {
        _initWithRetry(0);
      });
    } else {
      _initWithRetry(0);
    }
  }, 5000);
}

// Remove stale Chromium lock files left after a crash/restart
function _clearChromiumLocks() {
  // Can be implemented if needed for the deployment platform
}

let initAttempt = 0;
function _initWithRetry(attempt) {
  initAttempt = attempt;
  if (attempt > 8) {
    log('Init failed after 8 retries. Container may lack WA network access.');
    return;
  }

  _clearChromiumLocks();

  log(`Initializing WhatsApp client (attempt ${attempt + 1}/9)...`);

  if (!client) {
    initWhatsAppClient();
  }

  client.initialize().catch(async (err) => {
    const msg = err.message || err.toString();
    log(`Init error details: ${msg}`);

    // Destroy the current client to kill the browser process and prevent locks
    const oldClient = client;
    client = null;
    if (oldClient) {
      try {
        await oldClient.destroy();
      } catch (e) { }
    }

    if (msg.includes('already running')) {
      log('Browser lock conflict. Clearing locks and retrying in 3s...');
      _clearChromiumLocks();
      setTimeout(() => _initWithRetry(attempt + 1), 3000);
    } else if (msg.includes('net::ERR_TIMED_OUT') || msg.includes('ERR_TIMED_OUT')) {
      log(`Network ERR_TIMED_OUT. Retrying in 5s...`);
      setTimeout(() => _initWithRetry(attempt + 1), 5000);
    } else if (
      msg.includes('TIMED_OUT') ||
      msg.includes('net::ERR') ||
      msg.includes('auth timeout') ||
      msg.includes('timeout')
    ) {
      log(`Timeout (${msg.slice(0, 80)}). Retrying in 10s...`);
      setTimeout(() => _initWithRetry(attempt + 1), 10000);
    } else {
      log('Init error: ' + msg);
      setTimeout(() => _initWithRetry(attempt + 1), 5000);
    }
  });
}

// Run quick network diagnostic checks for web.whatsapp.com
async function runDiagnostics() {
  const dns = require('dns').promises;
  const https = require('https');
  log('--- Starting Network Diagnostics ---');

  if (process.env.PROXY_SERVER) {
    const redactedProxy = process.env.PROXY_SERVER.replace(/:[^:@]+@/, ':***@');
    log(`Proxy Configured: ${redactedProxy}`);
  } else {
    log(`Proxy Configured: None`);
  }

  try {
    const addresses = await dns.resolve4('web.whatsapp.com');
    log(`DNS: web.whatsapp.com resolved to: ${addresses.join(', ')}`);
  } catch (err) {
    log(`DNS: Failed to resolve web.whatsapp.com: ${err.message}`);
  }

  const start = Date.now();
  try {
    await new Promise((resolve, reject) => {
      const reqObj = https.get('https://web.whatsapp.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      }, (response) => {
        log(`HTTPS: Connected to web.whatsapp.com. Status: ${response.statusCode} (took ${Date.now() - start}ms)`);
        resolve();
      });
      reqObj.on('error', (err) => {
        log(`HTTPS: Failed to connect to web.whatsapp.com: ${err.message} (took ${Date.now() - start}ms)`);
        reject(err);
      });
      reqObj.setTimeout(10000, () => {
        reqObj.destroy();
        log(`HTTPS: Connection to web.whatsapp.com timed out after 10s`);
        reject(new Error('Timeout'));
      });
    });
  } catch (err) {
    // Logged inside the handlers
  }
  log('------------------------------------');
}

runDiagnostics().finally(() => {
  _initWithRetry(0);
});

// ─── Authentication Routes ────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (getAuthenticatedUser(req)) {
    return res.redirect('/client');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.AUTH_USER || 'admin';
  const expectedPass = process.env.AUTH_PASSWORD || 'password';

  if (username === expectedUser && password === expectedPass) {
    const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiry
    const payload = `${username}|${expiry}`;
    const signature = crypto
      .createHmac('sha256', process.env.WA_SECRET || 'fallback_secret')
      .update(payload)
      .digest('hex');
    const token = `${payload}|${signature}`;

    res.setHeader('Set-Cookie', `wa_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
    return res.json({ success: true });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'wa_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
  res.json({ success: true });
});

// ─── Web UI ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (getAuthenticatedUser(req)) {
    return res.redirect('/client');
  }
  res.redirect('/login');
});

// ─── Sender client UI ─────────────────────────────────────────────────────────
app.get('/client', authenticateUi, (req, res) => {
  res.sendFile(path.join(__dirname, 'whatsapp-client.html'));
});
app.get('/chat', authenticateUi, (req, res) => {
  res.sendFile(path.join(__dirname, 'whatsapp-client.html'));
});

// ─── API ──────────────────────────────────────────────────────────────────────
app.get('/status', authenticateApi, (req, res) => {
  res.json({ 
    ready: isReady, 
    qr: qrCodeData,
    waSecret: WA_SECRET,
    username: process.env.AUTH_USER || 'admin'
  });
});

app.get('/api/automation/config', authenticateApi, (req, res) => {
  res.json(automationConfig);
});

app.post('/api/automation/config', authenticateApi, (req, res) => {
  const { enabled, systemPrompt, openRouterApiKey, model } = req.body;
  
  if (enabled !== undefined) automationConfig.enabled = !!enabled;
  if (systemPrompt !== undefined) automationConfig.systemPrompt = systemPrompt;
  if (openRouterApiKey !== undefined) automationConfig.openRouterApiKey = openRouterApiKey;
  if (model !== undefined) automationConfig.model = model;

  const success = saveAutomationConfig();
  if (success) {
    res.json({ success: true, config: automationConfig });
  } else {
    res.status(500).json({ error: 'Failed to save configuration file' });
  }
});

app.get('/debug', authenticateApi, async (req, res) => {
  const dns = require('dns').promises;
  const https = require('https');
  const results = {};

  try {
    const addresses = await dns.resolve4('web.whatsapp.com');
    results.dns = { success: true, addresses };
  } catch (err) {
    results.dns = { success: false, error: err.message };
  }

  const start = Date.now();
  try {
    const reqObj = https.get('https://web.whatsapp.com', (response) => {
      results.http = {
        success: true,
        statusCode: response.statusCode,
        timeMs: Date.now() - start
      };
      res.json(results);
    });

    reqObj.on('error', (err) => {
      results.http = {
        success: false,
        error: err.message,
        timeMs: Date.now() - start
      };
      res.json(results);
    });

    reqObj.setTimeout(5000, () => {
      reqObj.destroy();
      results.http = {
        success: false,
        error: 'Timeout after 5s',
        timeMs: Date.now() - start
      };
      res.json(results);
    });
  } catch (err) {
    results.http = {
      success: false,
      error: err.message,
      timeMs: Date.now() - start
    };
    res.json(results);
  }
});

app.get('/api/chats', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready. Scan the QR code first.', ready: false });
  }
  try {
    const chats = await client.getChats();
    chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const chatList = await Promise.all(chats.slice(0, 40).map(async (chat) => {
      let lastMsg = null;
      if (chat.lastMessage) {
        lastMsg = {
          body: chat.lastMessage.body,
          fromMe: chat.lastMessage.fromMe,
          timestamp: chat.lastMessage.timestamp,
          type: chat.lastMessage.type
        };
      } else {
        try {
          const msgs = await chat.fetchMessages({ limit: 1 });
          if (msgs && msgs.length > 0) {
            lastMsg = {
              body: msgs[0].body,
              fromMe: msgs[0].fromMe,
              timestamp: msgs[0].timestamp,
              type: msgs[0].type
            };
          }
        } catch (err) {
          // ignore
        }
      }
      return {
        id: chat.id._serialized,
        name: chat.name || chat.id.user,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp,
        lastMessage: lastMsg
      };
    }));
    res.json(chatList);
  } catch (err) {
    log('Get chats error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats/:jid/messages', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready.' });
  }
  const jid = req.params.jid;
  try {
    const chat = await client.getChatById(jid);
    const messages = await chat.fetchMessages({ limit: 50 });

    const mappedMessages = messages.map(msg => ({
      id: msg.id.id,
      body: msg.body,
      from: msg.from,
      to: msg.to,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      type: msg.type,
      hasMedia: msg.hasMedia
    }));
    res.json(mappedMessages);
  } catch (err) {
    log(`Get messages for ${jid} error: ` + err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chats/:jid/messages', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready.' });
  }
  const jid = req.params.jid;
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message content is required' });
  }
  try {
    const sentMsg = await client.sendMessage(jid, message);
    res.json({
      success: true,
      message: {
        id: sentMsg.id.id,
        body: sentMsg.body,
        from: sentMsg.from,
        to: sentMsg.to,
        fromMe: sentMsg.fromMe,
        timestamp: sentMsg.timestamp,
        type: sentMsg.type
      }
    });
  } catch (err) {
    log(`Send message to ${jid} error: ` + err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready.' });
  }
  const { phone, message, countryCode, imageUrl, mediaUrl, mediaBase64, mediaMimeType, filename } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  const cc2 = (countryCode || '91').replace(/\D/g, '');
  try {
    const cleaned = phone.replace(/\D/g, '');
    const withCountry = cleaned.startsWith(cc2) ? cleaned : cc2 + cleaned;

    let targetJid = `${withCountry}@c.us`;
    try {
      const numberId = await client.getNumberId(withCountry);
      if (numberId) {
        targetJid = numberId._serialized;
      }
    } catch (err) {
      log(`Warning: getNumberId failed for ${withCountry}: ${err.message}. Falling back to standard JID.`);
    }

    const { MessageMedia } = require('whatsapp-web.js');
    let mediaToSend = null;
    const urlToUse = imageUrl || mediaUrl;

    if (mediaBase64 && mediaMimeType) {
      mediaToSend = new MessageMedia(mediaMimeType, mediaBase64, filename || 'file');
    } else if (urlToUse) {
      try {
        const response = await fetch(urlToUse);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mime = response.headers.get('content-type') || 'image/jpeg';
          mediaToSend = new MessageMedia(mime, buffer.toString('base64'), filename || 'file');
        } else {
          log(`Failed to fetch media URL: ${urlToUse}, status: ${response.status}`);
        }
      } catch (e) {
        log(`Error fetching media URL: ${e.message}`);
      }
    }

    if (mediaToSend) {
      await client.sendMessage(targetJid, mediaToSend, { caption: message || '' });
      log(`Media message sent to ${phone}`);
    } else {
      if (!message) return res.status(400).json({ error: 'message required if no media' });
      await client.sendMessage(targetJid, message);
      log(`Text message sent to ${phone}`);
    }
    res.json({ success: true });
  } catch (err) {
    log('Send error: ' + err.message);
    if (err.message && err.message.includes('detached Frame')) {
      isReady = false;
      _reconnect();
      return res.status(503).json({ error: 'WhatsApp session expired — reconnecting, try again in 10 s' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/broadcast', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready.' });
  }
  const { contacts, message, template, delay, interval } = req.body;
  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'contacts array is required' });
  }
  
  const msgText = message || template || '';
  if (!msgText) {
    return res.status(400).json({ error: 'message template content is required' });
  }

  const delaySec = parseInt(delay || interval || 5, 10);
  
  res.json({ success: true, message: `Started background broadcast to ${contacts.length} contacts.` });

  // Run in background
  (async () => {
    log(`[API Broadcast] Starting background broadcast to ${contacts.length} contacts...`);
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      let phone = '';
      
      if (typeof contact === 'string' || typeof contact === 'number') {
        phone = String(contact);
      } else if (contact && typeof contact === 'object') {
        phone = String(contact.phone || contact.Phone || contact.number || '');
      }

      if (!phone) {
        log(`[API Broadcast] Row #${i + 1}: Skipped (No phone number)`);
        continue;
      }

      let msgToSend = msgText;
      if (contact && typeof contact === 'object') {
        for (const key in contact) {
          msgToSend = msgToSend.replace(new RegExp(`{${key}}`, 'gi'), contact[key]);
        }
      }

      try {
        const cleaned = phone.replace(/\D/g, '');
        const cc2 = '91';
        const withCountry = cleaned.length <= 10 ? cc2 + cleaned : cleaned;
        let targetJid = `${withCountry}@c.us`;

        try {
          const numberId = await client.getNumberId(withCountry);
          if (numberId) {
            targetJid = numberId._serialized;
          }
        } catch (e) {}

        await client.sendMessage(targetJid, msgToSend);
        log(`[API Broadcast] Sent message to +${withCountry}`);
      } catch (err) {
        log(`[API Broadcast] Failed to send message to ${phone}: ${err.message}`);
      }

      if (i < contacts.length - 1) {
        const variance = (Math.random() * 0.4 - 0.2) * delaySec;
        const finalDelay = Math.max(1, delaySec + variance) * 1000;
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
    log(`[API Broadcast] Completed background broadcast.`);
  })();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function forwardToBackend(msg) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return;

  const fromJid = msg.from || (client?.info?.wid?._serialized) || 'system@c.us';
  const senderPhone = fromJid.split('@')[0];
  
  try {
    let mediaData = null;
    if (msg.hasMedia && typeof msg.downloadMedia === 'function') {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          mediaData = {
            mimetype: media.mimetype,
            data: media.data,
            filename: media.filename
          };
        }
      } catch (err) {
        console.error('Failed to download message media for forward:', err.message);
      }
    }

    log(`Forwarding message from ${senderPhone} to backend webhook...`);
    await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wa-secret': process.env.WA_SECRET || ''
      },
      body: JSON.stringify({
        from: senderPhone,
        cnumber: senderPhone,
        body: msg.body || msg.caption || '',
        hasMedia: !!msg.hasMedia,
        type: msg.type || 'chat',
        media: mediaData
      })
    });
  } catch (e) {
    log(`Failed to forward webhook to ${backendUrl}: ${e.message}`);
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFile(path.join(LOGS_DIR, 'service.log'), line + '\n', () => { });
}

function startKeepAlive() {
  const url = process.env.PUBLIC_URL || (process.env.SPACE_HOST ? `https://${process.env.SPACE_HOST}` : null);
  if (!url) {
    log('Keep-alive: Neither PUBLIC_URL nor SPACE_HOST is defined. Self-ping keep-alive is disabled.');
    return;
  }

  const intervalMinutes = parseFloat(process.env.KEEP_ALIVE_INTERVAL_MINUTES) || 45;
  const intervalMs = intervalMinutes * 60 * 1000;

  const headers = {};
  const hfToken = process.env.HF_TOKEN || process.env.HF_API_TOKEN;
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`;
    log('Keep-alive: Using token for self-ping authentication.');
  }

  log(`Keep-alive: Starting self-ping to ${url} every ${intervalMinutes} minutes.`);

  const sendPing = (type) => {
    log(`Keep-alive: Sending ${type} ping to ${url}...`);
    try {
      const clientModule = url.startsWith('https') ? https : http;
      const options = {
        headers: headers,
        timeout: 10000
      };

      clientModule.get(url, options, (res) => {
        log(`Keep-alive: ${type} ping response status code: ${res.statusCode}`);
      }).on('error', (err) => {
        log(`Keep-alive: ${type} ping request failed. Error: ${err.message}`);
      });
    } catch (err) {
      log(`Keep-alive: ${type} ping error: ${err.message}`);
    }
  };

  setTimeout(() => sendPing('initial'), 10000);
  setInterval(() => sendPing('periodic'), intervalMs);
}

app.listen(PORT, () => {
  log(`WhatsApp service running on http://localhost:${PORT}`);
  log('Open the URL above in a browser to scan QR code on first run');
  startKeepAlive();
});
