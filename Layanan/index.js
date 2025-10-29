// ==================== MODULE IMPORTS ==================== //
const { Telegraf } = require("telegraf");
const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");

const axios = require("axios");
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const AdmZip = require("adm-zip");
const tar = require("tar");
const os = require("os");
const fse = require("fs-extra");
const {
  default: makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  DisconnectReason,
  generateWAMessageFromContent
} = require('lotusbail');

// ==================== CONFIGURATION ==================== //
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const bot = new Telegraf(BOT_TOKEN);
const port = process.env.PORT || 3000;
const app = express();
const cors = require('cors');
app.use(cors());

// ==================== GLOBAL VARIABLES ==================== //
const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";
const file = "./database/akses.json";
const userPath = path.join(__dirname, "./database/user.json");
const cooldowns = {}; // key: username_mode, value: timestamp
let DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // default 5 menit
let userApiBug = null;
let sock;

const { connect, getDB } = require("./database/mongo.js");

// ==================== UTILITY FUNCTIONS ==================== //
async function loadAkses() {
  const db = getDB();
  let config = await db.collection("config").findOne();
  if (!config) {
    config = { owners: [], akses: [] };
    await db.collection("config").insertOne(config);
  }
  return config;
}

async function saveAkses(data) {
  const db = getDB();
  await db.collection("config").updateOne({}, { $set: data }, { upsert: true });
}

async function isOwner(id) {
  const data = await loadAkses();
  return data.owners.includes(id);
}

async function isAuthorized(id) {
  const data = await loadAkses();
  return isOwner(id) || data.akses.includes(id);
}

async function saveUsers(users) {
    const db = getDB();
    await db.collection('users').deleteMany({});
    if (users.length > 0) {
        await db.collection('users').insertMany(users);
    }
}

async function getUsers() {
    const db = getDB();
    return await db.collection('users').find().toArray();
}

const { proto } = require('lotusbail');

// Fungsi untuk menangani state otentikasi dengan MongoDB
const useMongoAuthState = async (botNumber) => {
    const db = getDB();
    const collection = db.collection('wa_sessions');

    const writeData = async (data, id) => {
        const sanitizedId = id.replace(/\//g, '__');
        await collection.updateOne({ _id: sanitizedId, botNumber }, { $set: { data: JSON.stringify(data, undefined, 2) } }, { upsert: true });
    };

    const readData = async (id) => {
        try {
            const sanitizedId = id.replace(/\//g, '__');
            const doc = await collection.findOne({ _id: sanitizedId, botNumber });
            return doc ? JSON.parse(doc.data) : null;
        } catch (error) {
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            const sanitizedId = id.replace(/\//g, '__');
            await collection.deleteOne({ _id: sanitizedId, botNumber });
        } catch (error) {
            // ignore
        }
    };

    const creds = await readData('creds') || proto.AuthenticationCreds.fromJSON(proto.AuthenticationCreds.create());

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key') {
                                value = proto.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData(creds, 'creds'),
        removeCreds: async () => {
            await collection.deleteMany({ botNumber });
        }
    };
};

function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}


function parseDuration(str) {
  if (!str || typeof str !== "string") return null;
  
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "s": return value * 1000;            // detik → ms
    case "m": return value * 60 * 1000;       // menit → ms
    case "h": return value * 60 * 60 * 1000;  // jam → ms
    case "d": return value * 24 * 60 * 60 * 1000; // hari → ms
    default: return null;
  }
}

// ==================== SESSION MANAGEMENT ==================== //
const getActiveSessions = async () => {
    const db = getDB();
    const doc = await db.collection('active_sessions').findOne({ _id: 'sessions' });
    return doc ? doc.numbers : [];
};

const saveActiveSession = async (botNumber) => {
    const db = getDB();
    await db.collection('active_sessions').updateOne({ _id: 'sessions' }, { $addToSet: { numbers: botNumber } }, { upsert: true });
};

const removeActiveSession = async (botNumber) => {
    const db = getDB();
    await db.collection('active_sessions').updateOne({ _id: 'sessions' }, { $pull: { numbers: botNumber } });
};

const writeCreds = async (botNumber, creds) => {
    const db = getDB();
    const collection = db.collection('wa_sessions');
    await collection.updateOne({ _id: 'creds', botNumber }, { $set: { data: JSON.stringify(creds, undefined, 2) } }, { upsert: true });
};

const removeSession = async (botNumber) => {
    const db = getDB();
    const collection = db.collection('wa_sessions');
    await collection.deleteMany({ botNumber });
};

const makeStatus = (number, status) => `

┌───────────────────────────┐
│ STATUS │ ${status.toUpperCase()}
├───────────────────────────┤
│ Nomor : ${number}
└───────────────────────────┘

`;

const makeCode = (number, code) => ({
  text: `

┌───────────────────────────┐
│ STATUS │ SEDANG PAIR
├───────────────────────────┤
│ Nomor : ${number}
│ Kode  : ${code}
└───────────────────────────┘

`,
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "!! 𝐒𝐚𝐥𝐢𝐧°𝐂𝐨𝐝𝐞 !!", callback_data: `salin|${code}` }]
    ]
  }
});

// ==================== WHATSAPP CONNECTION HANDLERS ==================== //

const initializeWhatsAppConnections = async () => {
  const activeNumbers = await getActiveSessions();
  
  console.log(chalk.blue(`
┌──────────────────────────────┐
│ Ditemukan sesi WhatsApp aktif
├──────────────────────────────┤
│ Jumlah : ${activeNumbers.length}
└──────────────────────────────┘ `));

  for (const BotNumber of activeNumbers) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const { state, saveCreds } = await useMongoAuthState(BotNumber);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log(`Bot ${BotNumber} terhubung!`);
        sessions.set(BotNumber, sock);
      }
      if (connection === "close") {
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          // Reconnect logic can be added here if needed
        } else {
            console.log(`Bot ${BotNumber} logged out.`);
            removeActiveSession(BotNumber);
        }
      }
    });
    sock.ev.on("creds.update", saveCreds);
  }
};

const connectToWhatsApp = async (BotNumber, chatId, ctx) => {
  const { state, saveCreds, removeCreds } = await useMongoAuthState(BotNumber);

  let statusMessage = await ctx.reply(`Pairing dengan nomor *${BotNumber}*...`, { parse_mode: "Markdown" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        await editStatus(makeStatus(BotNumber, "Menghubungkan ulang..."));
        connectToWhatsApp(BotNumber, chatId, ctx);
      } else {
        await editStatus(makeStatus(BotNumber, "❌ Gagal terhubung, QR expired atau logout."));
        await removeCreds();
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, sock);
      await saveActiveSession(BotNumber);
      await editStatus(makeStatus(BotNumber, "✅ Berhasil terhubung."));
    }

    if (qr) {
        const code = qr;
        const formatted = code.match(/.{1,4}/g)?.join("-") || code;
        await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, 
            makeCode(BotNumber, formatted).text, {
              parse_mode: "Markdown",
              reply_markup: makeCode(BotNumber, formatted).reply_markup
            });
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
};
// ==================== BOT COMMANDS ==================== //

// Start command
bot.command("start", (ctx) => {
  const teks = `( 🍁 ) ─── ❖ 情報 ❖  
𝗪𝗵𝗮𝘁𝘀𝗮𝗽𝗽 × 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺  
─── 革命的な自動化システム ───  
高速・柔軟性・絶対的な安全性を備えた 次世代ボットが今、覚醒する。

〢「 𝐗𝐈𝐒 ☇ 𝐂𝐨𝐫𝐞 ° 𝐒𝐲𝐬𝐭𝐞𝐦𝐬 」
 ࿇ Author : —!s' Gxyenn 正式
 ࿇ Type : ( Case─Plugins )
 ࿇ League : Asia/Jakarta-
┌─────────
├──── ▢ ( 𖣂 ) Sender Handler
├── ▢ owner users
│── /addbot — <nomor>
│── /listsender —
│── /delsender — <nomor>
│── /add — <cards.json>
└────
┌─────────
├──── ▢ ( 𖣂 ) Key Manager
├── ▢ admin users
│── /ckey — <username,durasi>
│── /listkey —
│── /delkey — <username>
└────
┌─────────
├──── ▢ ( 𖣂 ) Access Controls
├── ▢ owner users
│── /addacces — <user/id>
│── /delacces — <user/id>
│── /addowner — <user/id>
│── /delowner — <user/id>
│── /setjeda — <1m/1d/1s>
└────
┌─────────
├──── ▢ ( 𖣂 ) Cyber Security
├── ▢ owner users
│── /checkwa — <nomor>
└────`;
  ctx.replyWithPhoto(
    { url: "https://files.catbox.moe/ydj2rk.jpg" },
    {
      caption: teks,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👤「所有者」", url: "https://t.me/gxyenn" },
          { text: "🕊「チャネル」", url: "t.me/gxyenn" }
          ]
        ]
      }
    }
  );
});

// Sender management commands
bot.command("addbot", async (ctx) => {
  const userId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");

  if (!await isOwner(userId) && !await isAuthorized(userId)) {
    return ctx.reply("[ ! ] - ONLY ACCES USER\n—Please register first to access this feature.");
  }

  if (args.length < 2) {
    return ctx.reply("❌ *Syntax Error!*\n\n_Use : /addbot Number_\n_Example : /addbot 628xxxx_", { parse_mode: "Markdown" });
  }

  const BotNumber = args[1];
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

bot.command("listsender", async (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (!await isOwner(userId)) {
    return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
  }
  
  if (sessions.size === 0) return ctx.reply("Tidak ada sender aktif.");
  ctx.reply(`*Daftar Sender Aktif:*\n${[...sessions.keys()].map(n => `• ${n}`).join("\n")}`, 
    { parse_mode: "Markdown" });
});

bot.command("delbot", async (ctx) => {
  const userId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  
  if (!await isOwner(userId) && !await isAuthorized(userId)) {
    return ctx.reply("[ ! ] - ONLY ACCES USER\n—Please register first to access this feature.");
  }
  
  if (args.length < 2) return ctx.reply("❌ *Syntax Error!*\n\n_Use : /delbot Number_\n_Example : /delbot 628xxxx_", { parse_mode: "Markdown" });

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender tidak ditemukan.");

  try {
    const sock = sessions.get(number);
    sock.end(new Error("Session deleted by user"));
    sessions.delete(number);
    
    await removeActiveSession(number);
    await removeSession(number);

    ctx.reply(`✅ Session untuk bot ${number} berhasil dihapus.`);
  } catch (err) {
    console.error(err);
    ctx.reply("Terjadi error saat menghapus sender.");
  }
});

// Helper untuk cari creds.json
async function findCredsFile(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      const result = await findCredsFile(fullPath);
      if (result) return result;
    } else if (file.name === "creds.json") {
      return fullPath;
    }
  }
  return null;
}

// ===== Command /add =====
bot.command("add", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!await isOwner(userId)) {
    return ctx.reply("❌ Hanya owner yang bisa menggunakan perintah ini.");
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !reply.document) {
    return ctx.reply("❌ Balas file session dengan `/add`");
  }

  const doc = reply.document;
  const name = doc.file_name.toLowerCase();
  if (![`.json`, `.zip`, `.tar`, `.tar.gz`, `.tgz`].some(ext => name.endsWith(ext))) {
    return ctx.reply("❌ File bukan session yang valid (.json/.zip/.tar/.tar.gz/.tgz)");
  }

  await ctx.reply("🔄 Memproses session…");

  try {
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const { data } = await axios.get(link.href, { responseType: "arraybuffer" });
    const buf = Buffer.from(data);
    const tmp = await fse.mkdtemp(path.join(os.tmpdir(), "sess-"));

    if (name.endsWith(".json")) {
      await fse.writeFile(path.join(tmp, "creds.json"), buf);
    } else if (name.endsWith(".zip")) {
      new AdmZip(buf).extractAllTo(tmp, true);
    } else {
      const tmpTar = path.join(tmp, name);
      await fse.writeFile(tmpTar, buf);
      await tar.x({ file: tmpTar, cwd: tmp });
    }

    const credsPath = await findCredsFile(tmp);
    if (!credsPath) {
      return ctx.reply("❌ creds.json tidak ditemukan di dalam file.");
    }

    const creds = await fse.readJson(credsPath);
    const botNumber = creds.me.id.split(":")[0];

    await writeCreds(botNumber, creds);
    await saveActiveSession(botNumber);

    await connectToWhatsApp(botNumber, ctx.chat.id, ctx);

    return ctx.reply(`✅ Session *${botNumber}* berhasil ditambahkan & online.`, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("❌ Error add session:", err);
    return ctx.reply(`❌ Gagal memproses session.\nError: ${err.message}`);
  }
});

// Key management commands
bot.command("ckey", async (ctx) => {
  const userId = ctx.from.id.toString();
  const args   = ctx.message.text.split(" ")[1];
  
  if (!await isOwner(userId) && !await isAuthorized(userId)) {
    return ctx.telegram.sendMessage(
      userId,
      "[ ! ] - ONLY ACCES USER\n—Please register first to access this feature."
    );
  }
  
  if (!args || !args.includes(",")) {
    return ctx.telegram.sendMessage(
      userId,
      "❌ *Syntax Error!*\n\n_Use : /ckey User,Day_\n_Example : /ckey rann,30d",
      { parse_mode: "Markdown" }
    );
  }

  const [username, durasiStr] = args.split(",");
  const durationMs            = parseDuration(durasiStr.trim());
  if (!durationMs) {
    return ctx.telegram.sendMessage(
      userId,
      "❌ Format durasi salah! Gunakan contoh: 7d / 1d / 12h"
    );
  }

  const key     = generateKey(4);
  const expired = Date.now() + durationMs;
  const users   = await getUsers();

  const userIndex = users.findIndex(u => u.username === username);
  if (userIndex !== -1) {
    users[userIndex] = { ...users[userIndex], key, expired };
  } else {
    users.push({ username, key, expired });
  }

  saveUsers(users);

  const expiredStr = new Date(expired).toLocaleString("id-ID", {
    year    : "numeric",
    month   : "2-digit",
    day     : "2-digit",
    hour    : "2-digit",
    minute  : "2-digit",
    timeZone: "Asia/Jakarta"
  });

  // Kirim detail ke user (DM)
  ctx.telegram.sendMessage(
    userId,
    `✅ *Key berhasil dibuat:*\n\n` +
    `🆔 *Username:* \`${username}\`\n` +
    `🔑 *Key:* \`${key}\`\n` +
    `⏳ *Expired:* _${expiredStr}_WIB\n\n` +
    `*Note:*
- Jangan di sebar
- Jangan Di Freekan
- Jangan Di Jual Lagi`,
    { parse_mode: "Markdown" }
  ).then(() => {
    // Setelah terkirim → kasih notifikasi di group
    ctx.reply("✅ Success Send Key");
  }).catch(err => {
    ctx.reply("❌ Gagal mengirim key ke user.");
    console.error("Error kirim key:", err);
  });
});

bot.command("listkey", async (ctx) => {
  const userId = ctx.from.id.toString();
  const users = await getUsers();
  
  if (!await isOwner(userId)) {
    return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
  }
  
  if (users.length === 0) return ctx.reply("💢 No keys have been created yet.");

  let teks = `🕸️ *Active Key List:*\n\n`;
  users.forEach((u, i) => {
    const exp = new Date(u.expired).toLocaleString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    });
    teks += `*${i + 1}. ${u.username}*\nKey: \`${u.key}\`\nExpired: _${exp}_WIB\n\n`;
  });

  ctx.replyWithMarkdown(teks);
});

bot.command("delkey", async (ctx) => {
  const userId = ctx.from.id.toString();
  const username = ctx.message.text.split(" ")[1];
  
  if (!await isOwner(userId) && !await isAuthorized(userId)) {
    return ctx.reply("[ ! ] - ONLY ACCES USER\n—Please register first to access this feature.");
  }
  
  if (!username) return ctx.reply("❗Enter username!\nExample: /delkey rann");

  const users = await getUsers();
  const index = users.findIndex(u => u.username === username);
  if (index === -1) return ctx.reply(`❌ Username \`${username}\` not found.`, { parse_mode: "Markdown" });

  users.splice(index, 1);
  saveUsers(users);
  ctx.reply(`✅ Key belonging to *${username}* was successfully deleted.`, { parse_mode: "Markdown" });
});

// Access control commands
bot.command("addacces", async (ctx) => {
  const userId = ctx.from.id.toString();
  const id = ctx.message.text.split(" ")[1];
  
  if (!await isOwner(userId)) {
    return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
  }
  
  if (!id) return ctx.reply("❌ *Syntax Error!*\n\n_Use : /addacces Id_\n_Example : /addacces 7066156416_", { parse_mode: "Markdown" });

  const data = await loadAkses();
  if (data.akses.includes(id)) return ctx.reply("✅ User already has access.");

  data.akses.push(id);
  saveAkses(data);
  ctx.reply(`✅ Access granted to ID: ${id}`);
});

bot.command("delacces", async (ctx) => {
  const userId = ctx.from.id.toString();
  const id = ctx.message.text.split(" ")[1];
  
  if (!await isOwner(userId)) {
    return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
  }
  
  if (!id) return ctx.reply("❌ *Syntax Error!*\n\n_Use : /delacces Id_\n_Example : /delacces 7066156416_", { parse_mode: "Markdown" });

  const data = await loadAkses();
  if (!data.akses.includes(id)) return ctx.reply("❌ User not found.");

  data.akses = data.akses.filter(uid => uid !== id);
  saveAkses(data);
  ctx.reply(`✅ Access to user ID ${id} removed.`);
});

bot.command("addowner", async (ctx) => {
  const userId = ctx.from.id.toString();
  const id = ctx.message.text.split(" ")[1];
  
  if (!await isOwner(userId)) {
    return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
  }
  
  if (!id) return ctx.reply("❌ *Syntax Error!*\n\n_Use : /addowner Id_\n_Example : /addowner 7066156416_", { parse_mode: "Markdown" });

  const data = await loadAkses();
  if (data.owners.includes(id)) return ctx.reply("❌ Already an owner.");

  data.owners.push(id);
  saveAkses(data);
  ctx.reply(`✅ New owner added: ${id}`);
});

bot.command("delowner", async (ctx) => {
  const userId = ctx.from.id.toString();
  const id = ctx.message.text.split(" ")[1];
  
  if (!await isOwner(userId)) {
    return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
  }
  if (!id) return ctx.reply("❌ *Syntax Error!*\n\n_Use : /delowner Id_\n_Example : /delowner 7066156416_", { parse_mode: "Markdown" });

  const data = await loadAkses();

  if (!data.owners.includes(id)) return ctx.reply("❌ Not the owner.");

  data.owners = data.owners.filter(uid => uid !== id);
  saveAkses(data);

  ctx.reply(`✅ Owner ID ${id} was successfully deleted.`);
});

bot.command("checkwa", async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(" ");

    if (!await isOwner(userId)) {
        return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
    }

    if (args.length < 2) {
        return ctx.reply("❌ *Syntax Error!*\n\n_Use : /checkwa Number_\n_Example : /checkwa 628xxxx_", { parse_mode: "Markdown" });
    }

    const number = args[1];
    if (sessions.size === 0) {
        return ctx.reply("Tidak ada sender aktif.");
    }

    const sock = sessions.values().next().value; // Ambil sender pertama yang aktif

    try {
        const [result] = await sock.onWhatsApp(number);
        if (result && result.exists) {
            ctx.reply(`✅ Nomor ${number} terdaftar di WhatsApp.`);
        } else {
            ctx.reply(`❌ Nomor ${number} tidak terdaftar di WhatsApp.`);
        }
    } catch (error) {
        console.error("Error checking WhatsApp number:", error);
        ctx.reply("Terjadi error saat memeriksa nomor WhatsApp.");
    }
});

// ================== COMMAND /SETJEDA ================== //
bot.command("setjeda", async (ctx) => {
  const input = ctx.message.text.split(" ")[1]; 
  const ms = parseDuration(input);

  if (!ms) {
    return ctx.reply("❌ Format salah!\nContoh yang benar:\n- 30s (30 detik)\n- 5m (5 menit)\n- 1h (1 jam)\n- 1d (1 hari)");
  }

  globalThis.DEFAULT_COOLDOWN_MS = ms;
  DEFAULT_COOLDOWN_MS = ms; // sync ke alias lokal juga

  ctx.reply(`✅ Jeda berhasil diubah jadi *${input}* (${ms / 1000} detik)`);
});

bot.command("setmaxduration", async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(" ");

    if (!await isOwner(userId)) {
        return ctx.reply("[ ! ] - ONLY OWNER USER\n—Please register first to access this feature.");
    }

    if (args.length < 2) {
        return ctx.reply("❌ *Syntax Error!*\n\n_Use : /setmaxduration hours_\n_Example : /setmaxduration 24_", { parse_mode: "Markdown" });
    }

    const hours = parseInt(args[1]);
    if (isNaN(hours) || hours <= 0) {
        return ctx.reply("❌ Hours must be a positive number.");
    }

    const data = await loadAkses();
    data.max_duration = hours;
    await saveAkses(data);

    ctx.reply(`✅ Maximum attack duration set to ${hours} hours.`);
});

// ==================== BOT INITIALIZATION ==================== //
console.clear();
console.log(chalk.blue(`⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣤⣶⣾⣿⣿⣿⣷⣶⣤⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀
⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀
⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏⠀⠀⠀⠀
⠀⠀⠀⠀⢰⡟⠛⠉⠙⢻⣿⡟⠋⠉⠙⢻⡇⠀⠀⠀⠀
⠀⠀⠀⠀⢸⣷⣀⣀⣠⣾⠛⣷⣄⣀⣀⣼⡏⠀⠀⠀⠀
⠀⠀⣀⠀⠀⠛⠋⢻⣿⣧⣤⣸⣿⡟⠙⠛⠀⠀⣀⠀⠀
⢀⣰⣿⣦⠀⠀⠀⠼⣿⣿⣿⣿⣿⡷⠀⠀⠀⣰⣿⣆⡀
⢻⣿⣿⣿⣧⣄⠀⠀⠁⠉⠉⠋⠈⠀⠀⣀⣴⣿⣿⣿⡿
⠀⠀⠀⠈⠙⠻⣿⣶⣄⡀⠀⢀⣠⣴⣿⠿⠛⠉⠁⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠉⣻⣿⣷⣿⣟⠉⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢀⣠⣴⣿⠿⠋⠉⠙⠿⣷⣦⣄⡀⠀⠀⠀⠀
⣴⣶⣶⣾⡿⠟⠋⠀⠀⠀⠀⠀⠀⠀⠙⠻⣿⣷⣶⣶⣦
⠙⢻⣿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⣿⡿⠋
⠀⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠀
╭╮╱╭┳━━━┳━━━┳╮╱╱╭━━━┳━━━┳━╮╱╭┳━━━╮
┃┃╱┃┃╭━╮┃╭━╮┃┃╱╱┃╭━╮┃╭━╮┃┃╰╮┃┃╭━╮┃
┃╰━╯┃┃╱┃┃╰━━┫┃╱╱┃┃╱┃┃┃╱┃┃╭╮╰╯┃┃╱┃┃
┃╭━╮┃┃╱┃┣━━╮┃┃╱╭┫┃╱┃┃┃╱┃┃┃╰╮┃┃┃╱┃┃
┃┃╱┃┃╰━╯┃╰━╯┃╰━╯┃╰━╯┃╰━╯┃┃╱┃┃┃╰━╯┃
╰╯╱╰┻━━━┻━━━┻━━━┻━━━┻━━━┻╯╱╰━┻━━━╯⠀⠀⠀⠀⠀⠀⠀
`));

initializeWhatsAppConnections();

// ==================== WEB SERVER ==================== //
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/", (req, res) => {
  res.send('THIS IS VELYBUG');
});

app.post('/api/send', async (req, res) => {
  const { key, target, mode, duration } = req.body;

  if (!key || !target || !mode) {
    return res.status(400).json({ message: 'Missing required parameters: key, target, mode' });
  }

  const users = await getUsers();
  const user = users.find(u => u.key === key);

  if (!user) {
    return res.status(401).json({ message: 'Invalid key' });
  }

  if (user.expired && Date.now() > user.expired) {
    return res.status(401).json({ message: 'Key has expired' });
  }

  const data = await loadAkses();
  const maxDuration = data.max_duration || 24; // Default to 24 hours if not set

  const attackDuration = duration || 24; // Default to 24 hours if not provided

  if (attackDuration > maxDuration) {
    return res.status(400).json({ message: `Duration cannot be greater than ${maxDuration} hours` });
  }

  const targetJid = `${target}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return res.status(500).json({ message: 'No active senders' });
    }

    for (const sock of sessions.values()) {
        if (mode === "andros") {
            androcrash(sock, attackDuration, targetJid);
        } else if (mode === "ios") {
            Ipongcrash(sock, attackDuration, targetJid);
        } else if (mode === "andros-delay") {
            androdelay(sock, attackDuration, targetJid);
        } else if (mode === "invis-iphone") {
            Iponginvis(sock, attackDuration, targetJid);
        } else if (mode === "ganas") {
            ultimateCrash(sock, attackDuration, targetJid);
        } else {
            throw new Error("Unknown mode.");
        }
    }

    res.status(200).json({ message: `Attack started on ${target} with mode ${mode}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function startApp() {
  await connect();

  bot.launch();
  console.log(chalk.red(`
╭─☐ BOT Vely Bug
├─ ID OWN : ${OWNER_ID}
├─ DEVELOPER : Gxyenn 正式 
├─ MY SUPPORT : ALLAH 
├─ BOT : CONNECTED ✅
╰───────────────────`));

  initializeWhatsAppConnections();

  app.listen(port, () => {
    console.log(`🚀 Server aktif di port ${port}`);
  });
}

startApp();


// ==================== EXPORTS ==================== //
module.exports = { 
  loadAkses, 
  saveAkses, 
  isOwner, 
  isAuthorized,
  saveUsers,
  getUsers
};

// ==================== FLOOD FUNCTIONS ==================== //
// ====== TEMPAT FUNCTION BUGS ====== //


async function ultimateCrash(sock, duration, target) {
  const totalDurationMs = duration * 3600000;
  const startTime = Date.now();
  const burstCount = 5; // Jumlah semburan serangan
  const burstDelay = 500; // Jeda antar semburan (ms)

  const executeBurst = async () => {
    console.log(chalk.red(`🔥 Sending GANAS Burst to ${target}!`));
    try {
      await Promise.all([
        JawaDelay(sock, target),
        VenCrash(target),
        ZieeInvisForceIOS(sock, target),
        iosKontakNih(sock, target),
        crashIos(sock, target),
        uiIos(sock, target),
        iosNick(sock, target)
      ]);
      console.log(chalk.green(`✅ Burst sent successfully to ${target}`));
    } catch (error) {
      console.error(`❌ Error in GANAS burst: ${error.message}`);
    }
  };

  const runAttack = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
      console.log(chalk.blue("✅ Serangan Ganas Selesai."));
      return;
    }

    for (let i = 0; i < burstCount; i++) {
      await executeBurst();
      await new Promise(resolve => setTimeout(resolve, burstDelay));
    }
    
    // Jeda sebelum loop serangan berikutnya
    setTimeout(runAttack, 5000);
  };

  runAttack();
}

// ====== TEMPAT PEMANGGILAN FUNC & COMBO ======\nasync function androdelay(sock, duration, target) {
  const totalDurationMs = duration * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 400) {
        await Promise.all([
          JawaDelay(sock, target)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/400 Send Delay 🦠
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 2000); // ⏳ jeda 2 detik antar kiriman
      } else {
        console.log(chalk.green(`✅ Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow("( Grade Xtordcv 🍂 777 )."));
          count = 0;
          batch++;
          setTimeout(sendNext, 5000); // ⏳ jeda 5 detik antar batch
        } else {
          console.log(chalk.blue("( Done ) ${maxBatches} batch."));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 2000); // tetap pakai jeda antar kiriman
    }
  };
  sendNext();
}

async function androcrash(sock, duration, target) {
  const totalDurationMs = duration * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 400) {
        await Promise.all([         
         VenCrash(target),
         ZieeInvisForceIOS(sock, target)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/400 Send Bug Crash 
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 2000); // ⏳ jeda 2 detik antar kiriman
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow("( Grade Xtordcv 🍂 777 )."));
          count = 0;
          batch++;
          setTimeout(sendNext, 5000); // ⏳ jeda 5 detik antar batch
        } else {
          console.log(chalk.blue("( Done ) ${maxBatches} batch."));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 2000); // tetap pakai jeda antar kiriman
    }
  };
  sendNext();
}

async function Ipongcrash(sock, duration, target) {
  const totalDurationMs = duration * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 400) {
        await Promise.all([
          iosKontakNih(sock, target),
          crashIos(sock, target),
          uiIos(sock, target),
          iosNick(sock, target)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/400 Crash iPhone 
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 2000); // ⏳ jeda 2 detik antar kiriman
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow("( Grade Xtordcv 🍂 777 )."));
          count = 0;
          batch++;
          setTimeout(sendNext, 5000); // ⏳ jeda 5 detik antar batch
        } else {
          console.log(chalk.blue("( Done ) ${maxBatches} batch."));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 2000); // tetap pakai jeda antar kiriman
    }
  };
  sendNext();
}

async function Iponginvis(sock, duration, target) {
  const totalDurationMs = duration * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 400) {
        await Promise.all([
          iosKontakNih(sock, target),
          crashIos(sock, target),
          uiIos(sock, target),
          iosNick(sock, target)
        ]);
        console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/400 Invis iPhone 
└────────────────────────┘
  `));
        count++;
        setTimeout(sendNext, 2000); // ⏳ jeda 2 detik antar kiriman
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow("( Grade Xtordcv 🍂 777 )."));
          count = 0;
          batch++;
          setTimeout(sendNext, 5000); // ⏳ jeda 5 detik antar batch
        } else {
          console.log(chalk.blue("( Done ) ${maxBatches} batch."));
        }
      }
    } catch (error) {
      console.error(`❌ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 2000); // tetap pakai jeda antar kiriman
    }
  };
  sendNext();
}

// ==================== PLACEHOLDER FUNCTIONS ==================== //
function JawaDelay(sock, target) {
  console.log(`[INFO] JawaDelay called for target: ${target}`);
}

function VenCrash(target) {
  console.log(`[INFO] VenCrash called for target: ${target}`);
}

function ZieeInvisForceIOS(sock, target) {
  console.log(`[INFO] ZieeInvisForceIOS called for target:
${target}`);
}

function iosKontakNih(sock, target) {
  console.log(`[INFO] iosKontakNih called for target: ${target}`);
}

function crashIos(sock, target) {
  console.log(`[INFO] crashIos called for target: ${target}`);
}

function uiIos(sock, target) {
  console.log(`[INFO] uiIos called for target: ${target}`);
}

function iosNick(sock, target) {
  console.log(`[INFO] iosNick called for target: ${target}`);
}