// Original msg.js with contextInfo safe access
const { proto, downloadContentFromMessage, getContentType } = require('@whiskeysockets/baileys')
const fs = require('fs')

const downloadMediaMessage = async(m, filename) => {
	if (m.type === 'viewOnceMessage') {
		m.type = m.msg.type
	}
	let mediaType = m.type.replace('Message', '').toLowerCase()
	let extMap = { image: 'jpg', video: 'mp4', audio: 'mp3', sticker: 'webp', document: null }
	let ext = extMap[mediaType] || 'bin'
	if (m.type === 'documentMessage') {
		ext = m.msg.fileName.split('.').pop().replace('jpeg', 'jpg').replace('png', 'jpg').replace('m4a', 'mp3')
	}
	const name = filename ? filename + '.' + ext : 'undefined.' + ext
	const stream = await downloadContentFromMessage(m.msg, mediaType)
	let buffer = Buffer.from([])
	for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
	fs.writeFileSync(name, buffer)
	return fs.readFileSync(name)
}

const sms = (conn, m) => {
	if (m.key) {
		m.id = m.key.id
		m.chat = m.key.remoteJid
		m.fromMe = m.key.fromMe
		m.isGroup = m.chat.endsWith('@g.us')
		m.sender = m.fromMe ? conn.user.id.split(':')[0]+'@s.whatsapp.net' : m.isGroup ? m.key.participant : m.key.remoteJid
	}

	if (m.message) {
		m.type = getContentType(m.message)
		m.msg = (m.type === 'viewOnceMessage') ? m.message[m.type].message[getContentType(m.message[m.type].message)] : m.message[m.type]
		if (m.msg) {
			if (m.type === 'viewOnceMessage') {
				m.msg.type = getContentType(m.message[m.type].message)
			}

			let ctx = m.msg?.contextInfo || {}
			let quotedMention = ctx.participant || ''
			let tagMention = ctx.mentionedJid || []
			let mention = typeof tagMention === 'string' ? [tagMention] : tagMention
			if (mention) mention.push(quotedMention)
			m.mentionUser = mention.filter(x => x)

			m.body = (m.type === 'conversation') ? m.msg :
				(m.type === 'extendedTextMessage') ? m.msg.text :
				(m.type === 'imageMessage' && m.msg.caption) ? m.msg.caption :
				(m.type === 'videoMessage' && m.msg.caption) ? m.msg.caption :
				(m.type === 'templateButtonReplyMessage' && m.msg.selectedId) ? m.msg.selectedId :
				(m.type === 'buttonsResponseMessage' && m.msg.selectedButtonId) ? m.msg.selectedButtonId : ''

			m.quoted = ctx.quotedMessage || null
			if (m.quoted) {
				m.quoted.type = getContentType(m.quoted)
				m.quoted.id = ctx.stanzaId
				m.quoted.sender = ctx.participant
				m.quoted.fromMe = m.quoted.sender.split('@')[0].includes(conn.user.id.split(':')[0])
				m.quoted.msg = (m.quoted.type === 'viewOnceMessage') ? m.quoted[m.quoted.type].message[getContentType(m.quoted[m.quoted.type].message)] : m.quoted[m.quoted.type]
				if (m.quoted.type === 'viewOnceMessage') m.quoted.msg.type = getContentType(m.quoted[m.quoted.type].message)

				let qctx = m.quoted.msg?.contextInfo || {}
				let quotedMention2 = qctx.participant || ''
				let tagMention2 = qctx.mentionedJid || []
				let mention2 = typeof tagMention2 === 'string' ? [tagMention2] : tagMention2
				if (mention2) mention2.push(quotedMention2)
				m.quoted.mentionUser = mention2.filter(x => x)

				m.quoted.fakeObj = proto.WebMessageInfo.fromObject({
					key: {
						remoteJid: m.chat,
						fromMe: m.quoted.fromMe,
						id: m.quoted.id,
						participant: m.quoted.sender
					},
					message: m.quoted
				})

				m.quoted.download = (filename) => downloadMediaMessage(m.quoted, filename)
				m.quoted.delete = () => conn.sendMessage(m.chat, { delete: m.quoted.fakeObj.key })
				m.quoted.react = (emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.quoted.fakeObj.key } })
			}
		}
		m.download = (filename) => downloadMediaMessage(m, filename)
	}

	m.reply = (text, id = m.chat, option = { mentions: [m.sender] }) => conn.sendMessage(id, { text, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })
	m.replyS = (stik, id = m.chat, option = { mentions: [m.sender] }) => conn.sendMessage(id, { sticker: stik, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })
	m.replyImg = (img, text, id = m.chat, option = { mentions: [m.sender] }) => conn.sendMessage(id, { image: img, caption: text, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })
	m.replyVid = (vid, text, id = m.chat, option = { mentions: [m.sender], gif: false }) => conn.sendMessage(id, { video: vid, caption: text, gifPlayback: option.gif, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })
	m.replyAud = (aud, id = m.chat, option = { mentions: [m.sender], ptt: false }) => conn.sendMessage(id, { audio: aud, ptt: option.ptt, mimetype: 'audio/mpeg', contextInfo: { mentionedJid: option.mentions } }, { quoted: m })
	m.replyDoc = (doc, id = m.chat, option = { mentions: [m.sender], filename: 'undefined.pdf', mimetype: 'application/pdf' }) => conn.sendMessage(id, { document: doc, mimetype: option.mimetype, fileName: option.filename, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })
	m.replyContact = (name, info, number) => {
		var vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:' + name + '\nORG:' + info + ';\nTEL;type=CELL;type=VOICE;waid=' + number + ':+' + number + '\nEND:VCARD'
		conn.sendMessage(m.chat, { contacts: { displayName: name, contacts: [{ vcard }] } }, { quoted: m })
	}
	m.react = (emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } })

	return m
}

module.exports = { sms, downloadMediaMessage }
