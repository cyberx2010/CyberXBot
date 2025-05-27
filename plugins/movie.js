const axios = require("axios");
const { cmd, commands } = require('../command')
const config = require('../config');
const {fetchJson} = require('../lib/functions');


cmd({
  pattern: "sinhalasub",
  alias: ["ssub"],
  desc: "Search Sinhala Subtitles",
  category: "movie",
  use: ".sinhalasub 2024",
  filename: __filename
},
async (conn, mek, m, { from, q, reply, prefix }) => {
  try {
    if (!q) return reply("text එකක් දියන් යකූ (e.g. `.ssub 2024`)");

    const res = await fetchJson(`https://nethu-api-ashy.vercel.app/movie/sinhalasub/search?text=${encodeURIComponent(q)}`);

    if (!res.result || res.result.data.length === 0) {
      return reply("api call කරන්නෑ.");
    }

    const buttons = res.result.data.slice(0, 10).map((item, i) => ({
      buttonId: `${prefix}sub_search ${item.link}`,
      buttonText: { displayText: `${item.title}` },
      type: 1
    }));

    const buttonMessage = {
      image: { url: "https://i.ibb.co/1YPWpS3H/9882.jpg" },
      caption: `*Sinhala Subtitle Search Results for:* ${q}`,
      footer: "> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴏᴋᴜ-ᴍᴅ 🔒🪄",
      buttons: buttons,
      headerType: 4
    };

    return await conn.buttonMessage2(from, buttonMessage, mek);

  } catch (e) {
    reply('*Error !!*');
    console.error(e);
  }
});

cmd({
  pattern: "sub_search",
  react: "🔎",
  dontAddCommandList: true,
  filename: __filename
},
async (conn, mek, m, { from, q, reply, prefix }) => {
  try {
    if (!q) return reply("link eka diyan");

    const res = await fetchJson(`https://nethu-api-ashy.vercel.app/movie/sinhalasub/movie?url=${encodeURIComponent(q)}`);
    const data = res?.result?.data;
    if (!data) return reply("api eka call karanna bh");

    const caption = `
🎬 \`Title\` : ${data.title || "Not Available"}
🗓️ \`Date\` : ${data.date}
🌍 \`Country\` : ${data.country}
🎥 \`Director\` : ${data.director}
⭐ \`TMDB Rating\` : ${data.tmdbRate}
🗳️ \`SinhalaSub Votes\` : ${data.sinhalasubVote}
✍️ \`Subtitle Author\` : ${data.subtitle_author}
🎞️ \`Category\` : ${data.category.join(", ")}

🧾 *Description:* 
${data.description}
`.trim();

    const sections = [];

    if (Array.isArray(data.pixeldrain_dl)) {
      const pixeldrainRows = data.pixeldrain_dl.map(item => ({
        title: `${item.quality} (${item.size})`,
        rowId: `${prefix}sub_dl pixeldrain|${item.link}`
      }));
      sections.push({
        title: "📥 PixelDrain",
        rows: pixeldrainRows
      });
    }

    if (Array.isArray(data.ddl_dl)) {
      const ddlRows = data.ddl_dl.map(item => ({
        title: `${item.quality} (${item.size})`,
        rowId: `${prefix}sub_dl ddl|${item.link}`
      }));
      sections.push({
        title: "📥 DDL",
        rows: ddlRows
      });
    }

    await conn.sendMessage(from, {
      text: caption,
      footer: "> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴏᴋᴜ-ᴍᴅ 🔒🪄",
      title: "",
      buttonText: "`Reply Below Number` 🔢",
      sections,
      image: { url: data.image }
    }, { quoted: mek });

  } catch (e) {
    console.error(e);
    await reply('*Error !!*');
  }
});

cmd({
  pattern: "sub_dl",
  fromMe: false,
  desc: "Downloads the subtitle file from selected quality link",
  type: "download"
}, async (conn, mek, m, { q, reply }) => {
  try {
    const [type, link] = q.split("|");
    if (!link) return reply("❌ Link direct karanna bah");

    await conn.sendMessage(m.chat, {
      document: { url: link },
      mimetype: 'video/mp4',
      fileName: 'ʟᴏᴋᴜ-ᴍᴅ-ꜱɪɴʜᴀʟᴀꜱᴜʙ_ᴅʟ.mp4'
    }, { quoted: mek });

  } catch (e) {
    reply("❌ Download error.");
    console.error(e);
  }
});
