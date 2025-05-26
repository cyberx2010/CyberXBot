const config = require('../config');
const { cmd } = require('../command');
const { fetchJson } = require('../lib/functions');

cmd({
    pattern: "cine",
    react: '🔎',
    category: "movie",
    alias: ["cinesubz"],
    desc: "Movie downloader with Sinhala subtitles",
    filename: __filename
},
async (conn, m, mek, { from, q, prefix, reply }) => {
    try {
        if (!q) return await reply('*Please provide a search query!*');

        // Fetch movie data from API
        const apiUrl = config.CINE_API_URL || 'https://darksadas-yt-cinezub-search.vercel.app/';
        const res = await fetchJson(`${apiUrl}?query=${encodeURIComponent(q)}`);

        // Validate API response
        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
            return await reply('*No movies found for your query!*');
        }

        // Construct the list message
        const sections = [{
            title: "🎥 Movie Search Results",
            rows: res.data.map((item, index) => ({
                title: `${item.title || 'Unknown Title'} (${item.year || 'N/A'})`,
                rowId: `${prefix}cine ${item.url}±${index + 1}`
            }))
        }];

        const listMessage = {
            text: `*𝘾𝙄𝙉𝙀𝙎𝙐𝘽𝙕 𝙈𝙊𝙑𝙄𝙀 𝙎𝙀𝘼𝙍𝘾𝙃 𝙍𝙀𝙎𝙐𝙇𝙏𝙎 𝙁𝙊𝙍:* ${q}\n\n*Reply with a number to select a movie!*`,
            footer: `> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʜɪʀᴀɴ-ᴍᴅ 🔒🪄`,
            title: "🔎 Movie Search",
            buttonText: "*Reply Below Number 🔢*",
            sections,
            callback: async (m, responseText, { reply }) => {
                try {
                    if (!responseText.startsWith(prefix + 'cine')) {
                        return await reply('🚩 *Invalid selection!*');
                    }

                    const [, url, index] = responseText.split('±');
                    if (!url || !index) return await reply('🚩 *Invalid movie selection!*');

                    // Fetch movie details
                    const apiRes = await fetchJson(`https://cinesub-info.vercel.app/?url=${url}&apikey=${config.CINE_API_KEY || 'dinithimegana'}`);

                    if (!apiRes.data) {
                        return await reply('*Error: No details found for this movie!*');
                    }

                    // Construct movie details caption
                    const cap = `*☘️ Title ➜* *${apiRes.data.title || 'Unknown'}*\n\n` +
                                `*📆 Release ➜* _${apiRes.data.date || 'N/A'}_\n` +
                                `*⭐ Rating ➜* _${apiRes.data.imdb || 'N/A'}_\n` +
                                `*⏰ Runtime ➜* _${apiRes.data.runtime || 'N/A'}_\n` +
                                `*🌎 Country ➜* _${apiRes.data.country || 'N/A'}_\n` +
                                `*💁‍♂️ Subtitle Author ➜* _${apiRes.data.subtitle_author || 'N/A'}_\n`;

                    // Create download options
                    const downloadRows = Array.isArray(apiRes.dl_links) ? apiRes.dl_links.map((item, idx) => ({
                        title: `${item.quality} (${item.size})`,
                        rowId: `${prefix}cinedl ${apiRes.data.image || ''}±${item.link}±${apiRes.data.title || 'Unknown'}±${item.quality}`
                    })) : [];

                    // Create sections
                    const detailSections = [
                        {
                            title: "📥 Download Options",
                            rows: downloadRows
                        },
                        {
                            title: "ℹ️ More Info",
                            rows: [{
                                title: "Movie Details",
                                rowId: `${prefix}cine_details ${encodeURIComponent(JSON.stringify(apiRes.data))}`
                            }]
                        }
                    ];

                    // Send new list message
                    await conn.replyList(from, {
                        image: { url: apiRes.data.image?.replace("fit=", "") || 'https://files.catbox.moe/4fsn8g.jpg' },
                        text: `*Selected Movie: ${apiRes.data.title || 'Unknown'}*\n\nReply with a number to select an option!`,
                        footer: `> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʜɪʀᴀɴ-ᴍᴅ 🔒🪄`,
                        title: "🎬 Movie Options",
                        buttonText: "*Reply Below Number 🔢*",
                        sections: detailSections,
                        callback: async (m, subResponseText, { reply }) => {
                            try {
                                if (subResponseText.startsWith(prefix + 'cinedl')) {
                                    const [, image, link, title, quality] = subResponseText.split('±');
                                    await reply(`🎥 *Downloading ${title} (${quality})*\n🔗 *Link*: ${link}`);
                                } else if (subResponseText.startsWith(prefix + 'cine_details')) {
                                    const data = JSON.parse(decodeURIComponent(subResponseText.split(' ')[1]));
                                    const detailsCap = `*☘️ Title ➜* *${data.title || 'Unknown'}*\n\n` +
                                                      `*📆 Release ➜* _${data.date || 'N/A'}_\n` +
                                                      `*⭐ Rating ➜* _${data.imdb || 'N/A'}_\n` +
                                                      `*⏰ Runtime ➜* _${data.runtime || 'N/A'}_\n` +
                                                      `*🌎 Country ➜* _${data.country || 'N/A'}_\n` +
                                                      `*💁‍♂️ Subtitle Author ➜* _${data.subtitle_author || 'N/A'}_\n`;
                                    await conn.sendMessage(from, {
                                        image: { url: data.image?.replace("fit=", "") || 'https://files.catbox.moe/4fsn8g.jpg' },
                                        caption: detailsCap
                                    }, { quoted: m });
                                } else {
                                    await reply('🚩 *Invalid selection!*');
                                }
                            } catch (e) {
                                console.error('Error in sub-callback:', e);
                                await reply(`*Error: ${e.message || 'Invalid selection!'}*`);
                            }
                        }
                    }, m);
                } catch (e) {
                    console.error('Error in cine callback:', e);
                    await reply(`*Error: ${e.message || 'Something went wrong!'}*`);
                }
            }
        };

        await conn.replyList(from, listMessage, mek);
    } catch (e) {
        console.error('Error in cine command:', e);
        await reply(`*Error: ${e.message || 'Something went wrong!'}*`);
    }
});

cmd({
    pattern: "cinedl",
    dontAddCommandList: true,
    react: '🎥',
    desc: "Movie downloader",
    filename: __filename
},
async (conn, m, mek, { from, q, prefix, reply }) => {
    try {
        if (!q) return await reply('*Please provide a URL!*');

        let res = await fetchJson(`https://cinesub-info.vercel.app/?url=${q}&apikey=${config.CINE_API_KEY || 'dinithimegana'}`);

        if (!res.data) {
            return await conn.sendMessage(from, { text: '*Error: No movie data found!*' }, { quoted: mek });
        }

        let cap = `*☘️ Title ➜* *${res.data.title || 'Unknown'}*\n\n` +
                  `*📆 Release ➜* _${res.data.date || 'N/A'}_\n` +
                  `*⭐ Rating ➜* _${res.data.imdb || 'N/A'}_\n` +
                  `*⏰ Runtime ➜* _${res.data.runtime || 'N/A'}_\n` +
                  `*🌎 Country ➜* _${res.data.country || 'N/A'}_\n` +
                  `*💁‍♂️ Subtitle Author ➜* _${res.data.subtitle_author || 'N/A'}_\n`;

        if (!res.dl_links || !Array.isArray(res.dl_links) || res.dl_links.length === 0) {
            return await conn.sendMessage(from, { text: '*Error: No download links found!*' }, { quoted: mek });
        }

        const sections = [{
            title: "🎬 Cinesubz",
            rows: res.dl_links.map(item => ({
                title: `${item.quality} (${item.size})`,
                rowId: `${prefix}cinedl ${res.data.image || ''}±${item.link}±${res.data.title || 'Unknown'}±${item.quality}`
            }))
        }];

        const listMessage = {
            image: { url: res.data.image?.replace("fit=", "") || 'https://files.catbox.moe/4fsn8g.jpg' },
            text: cap,
            footer: `\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʜɪʀᴀɴ-ᴍᴅ 🔒🪄`,
            title: "📥 Download Option",
            buttonText: "*Reply Below Number 🔢*",
            sections,
            callback: async (m, responseText, { reply }) => {
                try {
                    if (responseText.startsWith(prefix + 'cinedl')) {
                        const [, image, link, title, quality] = responseText.split('±');
                        await reply(`🎥 *Downloading ${title} (${quality})*\n🔗 *Link*: ${link}`);
                    } else {
                        await reply('🚩 *Invalid selection!*');
                    }
                } catch (e) {
                    console.error('Error in cinedl callback:', e);
                    await reply(`*Error: ${e.message || 'Invalid selection!'}*`);
                }
            }
        };

        await conn.replyList(from, listMessage, mek);
    } catch (e) {
        console.error('Error in cinedl command:', e);
        await conn.sendMessage(from, { text: '*Error: Something went wrong!*' }, { quoted: mek });
    }
});

cmd({
    pattern: "cine_details",
    dontAddCommandList: true,
    react: 'ℹ️',
    desc: "Show movie details",
    filename: __filename
},
async (conn, m, mek, { from, q, reply }) => {
    try {
        if (!q) return await reply('*Error: No movie data provided!*');
        const data = JSON.parse(decodeURIComponent(q));
        const cap = `*☘️ Title ➜* *${data.title || 'Unknown'}*\n\n` +
                    `*📆 Release ➜* _${data.date || 'N/A'}_\n` +
                    `*⭐ Rating ➜* _${data.imdb || 'N/A'}_\n` +
                    `*⏰ Runtime ➜* _${data.runtime || 'N/A'}_\n` +
                    `*🌎 Country ➜* _${data.country || 'N/A'}_\n` +
                    `*💁‍♂️ Subtitle Author ➜* _${data.subtitle_author || 'N/A'}_\n`;
        await conn.sendMessage(from, {
            image: { url: data.image?.replace("fit=", "") || 'https://files.catbox.moe/4fsn8g.jpg' },
            caption: cap
        }, { quoted: m });
    } catch (e) {
        console.error('Error in cine_details command:', e);
        await reply(`*Error: ${e.message || 'Something went wrong!'}*`);
    }
});
