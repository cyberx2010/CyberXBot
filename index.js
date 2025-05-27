// Import required dependencies
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers,
  generateWAMessageFromContent,
  proto,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const { File } = require('megajs');
const path = require('path');
const express = require('express');
const AdmZip = require('adm-zip');
const NodeCache = require('node-cache');
const util = require('util');
const { sms } = require('./lib/msg');
const { getBuffer, getGroupAdmins, getRandom, sleep, fetchJson } = require('./lib/functions');
const config = require('./config');

// Initialize message retry cache and reply map
const msgRetryCounterCache = new NodeCache();
const replyMap = new Map();

// Configuration defaults
const SESSION_DIR = path.join(__dirname, config.SESSION_NAME || 'auth_info_baileys');
const PLUGINS_DIR = './plugins';
const DATA_DIR = './data';
const REPLY_DB = path.join(DATA_DIR, 'replies.json');
const PORT = process.env.PORT || config.PORT || 8000;

// Ensure directories exist
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load or initialize reply database
let replyDb = {};
if (fs.existsSync(REPLY_DB)) {
  replyDb = JSON.parse(fs.readFileSync(REPLY_DB, 'utf8'));
}

// Save reply database
function saveReplyDb() {
  fs.writeFileSync(REPLY_DB, JSON.stringify(replyDb, null, 2));
}

// Handle session data download from Mega.nz
if (!fs.existsSync(path.join(SESSION_DIR, 'creds.json')) && config.SESSION_ID) {
  const sessdata = config.SESSION_ID.replace('MOVIE-VISPER=', '');
  const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
  filer.download((err, data) => {
    if (err) throw new Error(`Session download failed: ${err}`);
    fs.writeFileSync(path.join(SESSION_DIR, 'creds.json'), data);
    console.log('Session downloaded successfully ✅');
  });
}

// Initialize Express server
const app = express();
const logger = P({ level: config.LOG_LEVEL || 'silent' });

// Load plugins
async function loadPlugins() {
  try {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      const response = await axios.get('https://mv-visper-full-db.pages.dev/Main/alex.json');
      const megaUrl = response.data.megaurl;
      const file = File.fromURL(megaUrl);
      const zipData = await file.download();
      const zipPath = path.join(__dirname, 'temp.zip');
      fs.writeFileSync(zipPath, zipData);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(__dirname, true);
      fs.unlinkSync(zipPath);
      console.log('Plugins extracted successfully ✅');
    }
    fs.readdirSync(PLUGINS_DIR).forEach(file => {
      if (path.extname(file).toLowerCase() === '.js') {
        require(path.join(__dirname, PLUGINS_DIR, file));
      }
    });
    console.log('Plugins loaded successfully ✅');
  } catch (err) {
    logger.error(`Failed to load plugins: ${err}`);
  }
}

// Main WhatsApp connection function
async function connectToWA() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const conn = makeWASocket({
    logger,
    printQRInTerminal: true,
    browser: Browsers.macOS('Firefox'),
    auth: state,
    version,
    msgRetryCounterCache,
  });

  // Reply tracker method
  conn.addReplyTracker = (msgId, callback) => {
    replyMap.set(msgId, { callback });
    setTimeout(() => replyMap.delete(msgId), 5 * 60 * 1000);
  };

  // Custom message methods
  conn.listMessage = async (jid, content, quoted = null) => {
    try {
      let text = '';
      const cmdStore = [];
      content.sections.forEach((section, index) => {
        const sectionId = `${index + 1}`;
        text += `\n*${section.title}*\n\n`;
        section.rows.forEach((row, rowIndex) => {
          const rowId = `${sectionId}.${rowIndex + 1}`;
          text += `*${rowId} ||* ${row.title}\n`;
          if (row.description) text += `   ${row.description}\n\n`;
          cmdStore.push({ cmdId: rowId, cmd: row.rowId });
        });
      });
      const finalText = `${content.text || ''}\n\n${content.title || ''}\n${text}\n${content.footer || ''}`;
      const sentMsg = await conn.sendMessage(jid, { text: finalText }, { quoted });
      replyDb[sentMsg.key.id] = cmdStore;
      saveReplyDb();
      conn.addReplyTracker(sentMsg.key.id, async (m, response) => {
        const cmd = cmdStore.find(c => c.cmdId === response);
        if (cmd) {
          const cmdModule = require('./command').commands.find(c => c.pattern === cmd.cmd || c.alias?.includes(cmd.cmd));
          if (cmdModule) {
            await cmdModule.function(conn, m.message, m, { from: jid, reply: async text => await conn.sendMessage(jid, { text }, { quoted: m.message }) });
          }
        }
      });
      return sentMsg;
    } catch (err) {
      logger.error(`List message error: ${err}`);
      throw err;
    }
  };

  conn.buttonMessage = async (jid, content, quoted = null) => {
    try {
      let text = '';
      const cmdStore = [];
      content.buttons.forEach((button, index) => {
        const buttonId = `${index + 1}`;
        text += `\n*${buttonId} ||* ${button.buttonText.displayText}\n`;
        cmdStore.push({ cmdId: buttonId, cmd: button.buttonId });
      });
      const finalText = content.headerType === 1
        ? `${content.text || content.title}\n\n*Reply Below Number 🔢*\n${text}\n\n${content.footer || ''}`
        : `${content.title || ''}\n\n${text}\n\n${content.footer || ''}`;
      const msgContent = content.headerType === 4
        ? { image: content.image, caption: finalText }
        : { text: finalText };
      const sentMsg = await conn.sendMessage(jid, msgContent, { quoted });
      replyDb[sentMsg.key.id] = cmdStore;
      saveReplyDb();
      conn.addReplyTracker(sentMsg.key.id, async (m, response) => {
        const cmd = cmdStore.find(c => c.cmdId === response);
        if (cmd) {
          const cmdModule = require('./command').commands.find(c => c.pattern === cmd.cmd || c.alias?.includes(cmd.cmd));
          if (cmdModule) {
            await cmdModule.function(conn, m.message, m, { from: jid, reply: async text => await conn.sendMessage(jid, { text }, { quoted: m.message }) });
          }
        }
      });
      return sentMsg;
    } catch (err) {
      logger.error(`Button message error: ${err}`);
      throw err;
    }
  };

  // Connection update handling
  conn.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        connectToWA();
      } else {
        logger.error('Logged out. Please re-authenticate.');
      }
    } else if (connection === 'open') {
      console.log('Bot connected to WhatsApp ✅');
      await conn.sendMessage(config.OWNER_NUMBER + '@s.whatsapp.net', {
        image: { url: config.LOGO_URL || 'https://files.catbox.moe/lacqi4.jpg' },
        caption: `HIRAN-VISPER MD connected!`,
      });
    }
  });

  conn.ev.on('creds.update', saveCreds);

  // Message handling
  conn.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message) return;
      msg.message = getContentType(msg.message) === 'ephemeralMessage' ? msg.message.ephemeralMessage.message : msg.message;
      const m = sms(conn, msg);
      const msgType = getContentType(msg.message);
      const from = msg.key.remoteJid;
      const quoted = msgType === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage;
      const text = msgType === 'conversation' ? msg.message.conversation :
                  msgType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
                  msgType === 'imageMessage' && msg.message.imageMessage.caption ? msg.message.imageMessage.caption :
                  msgType === 'videoMessage' && msg.message.videoMessage.caption ? msg.message.videoMessage.caption : '';
      const isCmd = text.startsWith(config.PREFIX || '.');
      const command = isCmd ? text.slice((config.PREFIX || '.').length).trim().split(' ')[0].toLowerCase() : '';
      const args = text.trim().split(/ +/).slice(1);
      const q = args.join(' ');
      const isGroup = from.endsWith('@g.us');
      const sender = msg.key.fromMe ? conn.user.id : msg.key.participant || msg.key.remoteJid;
      const senderNumber = sender.split('@')[0];
      const botNumber = conn.user.id.split(':')[0];
      const botNumber2 = await jidNormalizedUser(conn.user.id);
      const isMe = botNumber.includes(senderNumber);
      const isOwner = config.OWNER_NUMBER.split(',').includes(senderNumber) || isMe;
      const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(() => null) : null;
      const groupName = isGroup ? groupMetadata.subject : '';
      const participants = isGroup ? groupMetadata.participants : [];
      const groupAdmins = isGroup ? getGroupAdmins(participants) : [];
      const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
      const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

      const reply = async (text) => {
        await conn.sendMessage(from, { text }, { quoted: msg });
      };

      // Reply tracker handling
      const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key.id;
      if (replyDb[stanzaId] && text.match(/^\d+(\.\d+)?$/)) {
        const cmd = replyDb[stanzaId].find(c => c.cmdId === text);
        if (cmd) {
          const cmdModule = require('./command').commands.find(c => c.pattern === cmd.cmd || c.alias?.includes(cmd.cmd));
          if (cmdModule) {
            await cmdModule.function(conn, msg, m, {
              from,
              reply,
              command: cmd.cmd,
              isOwner,
              isGroup,
              sender,
              senderNumber,
              botNumber,
              botNumber2,
              groupMetadata,
              groupName,
              participants,
              groupAdmins,
              isBotAdmins,
              isAdmins,
            });
          }
          return;
        }
      }

      // Command execution
      const commands = require('./command');
      const cmd = isCmd ? commands.commands.find(c => c.pattern === command) || commands.commands.find(c => c.alias?.includes(command)) : null;
      if (cmd) {
        if (cmd.react) await conn.sendMessage(from, { react: { text: cmd.react, key: msg.key } });
        try {
          await cmd.function(conn, msg, m, {
            from,
            prefix: config.PREFIX || '.',
            quoted,
            body: text,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname: msg.pushName || 'User',
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
            replyMap,
          });
        } catch (err) {
          logger.error(`Command ${command} failed: ${err}`);
          await reply(`Error executing command: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`Message processing error: ${err}`);
    }
  });
}

// Example command.js for listMessage and buttonMessage
const commands = {
  commands: [
    {
      pattern: 'menu',
      alias: ['help'],
      react: '📋',
      function: async (conn, msg, m, { from, reply }) => {
        await conn.listMessage(from, {
          text: 'Welcome to HIRAN-VISPER MD!',
          title: 'Main Menu',
          footer: 'Choose an option by replying with the number.',
          sections: [
            {
              title: 'General Commands',
              rows: [
                { title: 'Ping', rowId: 'ping', description: 'Check bot status' },
                { title: 'Info', rowId: 'info', description: 'Get bot info' },
              ],
            },
            {
              title: 'Fun Commands',
              rows: [
                { title: 'Joke', rowId: 'joke', description: 'Get a random joke' },
              ],
            },
          ],
        }, msg);
      },
    },
    {
      pattern: 'button',
      react: '🔘',
      function: async (conn, msg, m, { from, reply }) => {
        await conn.buttonMessage(from, {
          headerType: 4,
          title: 'Interactive Buttons',
          image: { url: config.LOGO_URL || 'https://files.catbox.moe/lacqi4.jpg' },
          text: 'Select an option below:',
          footer: 'Reply with the number to choose.',
          buttons: [
            { buttonId: 'ping', buttonText: { displayText: 'Ping' } },
            { buttonId: 'info', buttonText: { displayText: 'Info' } },
          ],
        }, msg);
      },
    },
    {
      pattern: 'ping',
      react: '🏓',
      function: async (conn, msg, m, { reply }) => {
        await reply('Pong!');
      },
    },
    {
      pattern: 'info',
      react: 'ℹ️',
      function: async (conn, msg, m, { reply }) => {
        await reply('HIRAN-VISPER MD: A powerful WhatsApp bot.');
      },
    },
    {
      pattern: 'joke',
      react: '😂',
      function: async (conn, msg, m, { reply }) => {
        await reply('Why did the scarecrow become a motivational speaker? Because he was outstanding in his field!');
      },
    },
  ],
};

// Export commands for use in main script
module.exports.commands = commands.commands;

// Start the bot
async function startBot() {
  try {
    await loadPlugins();
    await connectToWA();
  } catch (err) {
    logger.error(`Startup error: ${err}`);
    setTimeout(startBot, 5000);
  }
}

// Start Express server
app.get('/', (req, res) => res.send('HIRAN-VISPER MD running successfully!'));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  if (err.message.includes('Socket connection timeout') ||
      err.message.includes('Authentication timed out') ||
      err.message.includes('Connection Closed') ||
      err.message.includes('rate-overlimit')) {
    return;
  }
  logger.error(`Uncaught exception: ${err}`);
  startBot();
});

// Start the bot
setTimeout(startBot, 3000);
