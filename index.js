const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser, getContentType, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');

const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions');
const fs = require('fs');
const P = require('pino');
const config = require('./config');
const qrcode = require('qrcode-terminal');
const util = require('util');
const { sms, downloadMediaMessage } = require('./lib/msg');
const axios = require('axios');
const { File } = require('megajs');
const prefix = '.';

const ownerNumber = ['94768698018'];

let replyMap = new Map();

// Add reply tracker method to conn later after connection

if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
  if (!config.SESSION_ID) return console.log('Please add your session to SESSION_ID env !!');
  const sessdata = config.SESSION_ID;
  const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
  filer.download((err, data) => {
    if (err) throw err;
    fs.writeFile(__dirname + '/auth_info_baileys/creds.json', data, () => {
      console.log("Session downloaded ✅");
    });
  });
}

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;

async function connectToWA() {
  console.log("Connecting wa bot 🧬...");
  const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/auth_info_baileys/');
  var { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    syncFullHistory: true,
    auth: state,
    version
  });

  // Add reply tracker method here:
  conn.addReplyTracker = (msgId, callback) => {
    replyMap.set(msgId, { callback });

    // Auto remove after 5 minutes
    setTimeout(() => {
      replyMap.delete(msgId);
    }, 5 * 60 * 1000);
  };

  conn.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
        connectToWA();
      }
    } else if (connection === 'open') {
      console.log('😼 Installing... ');
      const path = require('path');
      fs.readdirSync("./plugins/").forEach((plugin) => {
        if (path.extname(plugin).toLowerCase() == ".js") {
          require("./plugins/" + plugin);
        }
      });
      console.log('Plugins installed successful ✅');
      console.log('Bot connected to whatsapp ✅');

      const up = `╭━━━〔 HIRAN  MD  V4 〕━━━╮

┃
┃ 🤖 HIRAN MD OFFICIAL
┃ 𝙋𝙤𝙬𝙚𝙧𝙛𝙪𝙡 𝙈𝙪𝙡𝙩𝙞𝙙𝙚𝙫𝙞𝙘𝙚 𝘽𝙤𝙩
┃
┃ 👋 HELLO, ${conn.user.name || "User"}!
┃ Welcome to HIRAN MultiDevice Bot ✅
┃
┃━━━━━━━━━━━━━━━
┃ 📢 WhatsApp Channel:
┃ https://whatsapp.com/channel/0029VbAqseT30LKNCO71mQ3d
┃
┃ ▶️ YouTube Channel:
┃ https://youtube.com/@hiruwatech
┃
┃ ☎️ Contact:
┃ https://wa.me/message/C3WDNO2UCH7RC1
┃
┃━━━━━━━━━━━━━━━
┃
┃ © Powered by Hiranya Sathsara
╰━━━━━━━━━━━━━━━━━━━╯`;

      conn.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
        image: { url: "https://files.catbox.moe/lacqi4.jpg" },
        caption: up
      });
    }
  });

  conn.ev.on('creds.update', saveCreds);

  conn.ev.on('messages.upsert', async (mek) => {
    mek = mek.messages[0];
    if (!mek.message) return;
    mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
    const m = sms(conn, mek);
    const type = getContentType(mek.message);
    const content = JSON.stringify(mek.message);
    const from = mek.key.remoteJid;
    const quoted = (type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null) ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : [];
    const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : '';
    const isCmd = body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(' ');
    const isGroup = from.endsWith('@g.us');
    const sender = mek.key.fromMe ? (conn.user.id.split(':')[0] + '@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid);
    const senderNumber = sender.split('@')[0];
    const botNumber = conn.user.id.split(':')[0];
    const pushname = mek.pushName || 'User';
    const isMe = botNumber.includes(senderNumber);
    const isOwner = ownerNumber.includes(senderNumber) || isMe;
    const botNumber2 = await jidNormalizedUser(conn.user.id);
    const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : '';
    const groupName = isGroup ? groupMetadata.subject : '';
    const participants = isGroup ? await groupMetadata.participants : '';
    const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
    const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
    const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
    const isReact = m.message.reactionMessage ? true : false;

    const reply = (teks) => {
      conn.sendMessage(from, { text: teks }, { quoted: mek });
    };

    // --- New stanzaId reply handling ---
    const stanzaId = mek.message?.extendedTextMessage?.contextInfo?.stanzaId || mek.key.id;
    if (replyMap.has(stanzaId)) {
      const { callback } = replyMap.get(stanzaId);
      return callback(m, (mek.message?.conversation || mek.message?.extendedTextMessage?.text || '').trim());
    }
    // --- end stanzaId reply handling ---

    const events = require('./command');
    const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
    if (isCmd) {
      const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName));
      if (cmd) {
        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
        try {
          cmd.function(conn, mek, m, {
            from, quoted, body, isCmd, command, args, q, isGroup, sender,
            senderNumber, botNumber2, botNumber, pushname, isMe, isOwner,
            groupMetadata, groupName, participants, groupAdmins, isBotAdmins,
            isAdmins, reply, replyMap
          });
        } catch (e) {
          console.error("[PLUGIN ERROR] " + e);
        }
      }
    }

    events.commands.map(async (command) => {
      if (body && command.on === "body") {
        command.function(conn, mek, m, {
          from, quoted, body, isCmd, command, args, q, isGroup, sender,
          senderNumber, botNumber2, botNumber, pushname, isMe, isOwner,
          groupMetadata, groupName, participants, groupAdmins, isBotAdmins,
          isAdmins, reply, replyMap
        });
      }
    });

  });
}

app.get("/", (req, res) => {
  res.send("hey, bot started✅");
});

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

setTimeout(() => {
  connectToWA();
}, 4000);
