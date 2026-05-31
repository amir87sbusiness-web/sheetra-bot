require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ── Validation ──────────────────────────────────────────────────────────────
if (!process.env.BOT_TOKEN || !process.env.ADMIN_CHAT_ID) {
  console.error('❌ BOT_TOKEN یا ADMIN_CHAT_ID تعریف نشده');
  process.exit(1);
}

// ── Config ──────────────────────────────────────────────────────────────────
const TOKEN = process.env.BOT_TOKEN;
const ADMIN = String(process.env.ADMIN_CHAT_ID);
const CARD  = '5022291569609694';
const PRICE = '۲۴۹,۰۰۰';

const bot = new TelegramBot(TOKEN, { polling: true });

// ── Database (JSON) ─────────────────────────────────────────────────────────
// ⚠️ Railway: دیتا روی ریستارت پاک میشه. برای نگهداری دائمی، Railway Volume اضافه کن.
const DB_FILE = './db.json';
let db = { users: {}, fileId: process.env.HABIT_FILE_ID || null, approved: 0, rejected: 0 };

const saveDB = () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE)) }; } catch {}

// ── State & Anti-Flood ──────────────────────────────────────────────────────
let adminMode = null; // null | 'broadcast' | 'setfile'
const floods  = new Map();

const antiFlood = (id) => {
  if ((floods.get(id) || 0) > Date.now() - 2500) return false;
  floods.set(id, Date.now());
  return true;
};
const isAdmin = (id) => String(id) === ADMIN;

// ── Messages ─────────────────────────────────────────────────────────────────
const T = {
  start: (n) =>
    `سلام ${n} 👋\n\nبه <b>شیترا</b> خوش اومدی.\nاینجا نظم واقعی شروع میشه.\n\n👇`,

  buy:
    `🎯 <b>هبیت‌ترکر شیترا</b>\n\n` +
    `✦ ردیابی عادت‌ها و اهداف روزانه\n` +
    `✦ نمودار پیشرفت خودکار\n` +
    `✦ روی موبایل، تبلت و لپتاپ\n\n` +
    `💰 <b>${PRICE} تومان</b>\n` +
    `🏦 <code>${CARD}</code>\n` +
    `<i>← روی کارت بزن کپی کن</i>\n\n` +
    `بعد از پرداخت، رسید یا شناسه تراکنش رو اینجا بفرست 👇`,

  howto:
    `💡 <b>در ۳ قدم شروع کن</b>\n\n` +
    `۱. فایل رو باز کن\n` +
    `۲. عادت‌هاتو وارد کن\n` +
    `۳. هر روز تیک بزن ✅\n\n` +
    `نمودارها خودکار آپدیت میشن.\n` +
    `<i>داخل فایل یه ویدیوی آموزشی کوتاه هم هست.</i>`,

  support:
    `📞 <b>پشتیبانی</b>\n\n` +
    `🆔 @sheetra_support\n\n` +
    `هر سوالی داشتی مستقیم بفرست.`,

  got:     `✅ رسیدت رسید!\nداریم چک می‌کنیم، فایل رو خیلی زود بهت میفرستیم.`,
  done:    `🎉 <b>پرداختت تایید شد!</b>\n\nممنون از خریدت. فایلت رو دریافت کن 👇`,
  nope:    `❌ رسید تایید نشد.\nبرای پیگیری: @sheetra_support`,
  nofile:  `⚠️ فایل هنوز آپلود نشده. با پشتیبانی تماس بگیر:\n@sheetra_support`,

  stats: () => {
    const users   = Object.values(db.users);
    const pending = users.filter(u => u.s === 'pending').length;
    return (
      `📊 <b>آمار ربات</b>\n\n` +
      `👥 کاربران: <b>${users.length}</b>\n` +
      `⏳ در انتظار تایید: <b>${pending}</b>\n` +
      `✅ تایید شده: <b>${db.approved}</b>\n` +
      `❌ رد شده: <b>${db.rejected}</b>\n` +
      `📎 فایل: ${db.fileId ? '✅ تنظیم شده' : '❌ تنظیم نشده'}`
    );
  },

  help:
    `🛠 <b>دستورات ادمین</b>\n\n` +
    `/stats — آمار کلی\n` +
    `/users — لیست کاربران اخیر\n` +
    `/setfile — ثبت فایل هبیت‌ترکر\n` +
    `/broadcast — ارسال پیام به همه\n` +
    `/cancel — لغو عملیات جاری\n` +
    `/help — این منو`,
};

// ── Keyboards ─────────────────────────────────────────────────────────────────
const K = {
  main: { reply_markup: { inline_keyboard: [
    [{ text: '🎯 دریافت هبیت‌ترکر', callback_data: 'buy' }],
    [
      { text: '💡 راهنما', callback_data: 'howto' },
      { text: '📞 پشتیبانی', callback_data: 'support' },
    ],
  ]}},

  toBuy: { reply_markup: { inline_keyboard: [
    [{ text: '🎯 دریافت هبیت‌ترکر', callback_data: 'buy' }],
  ]}},

  action: (id) => ({ reply_markup: { inline_keyboard: [[
    { text: '✅ تایید + ارسال فایل', callback_data: `approve_${id}` },
    { text: '❌ رد تراکنش',          callback_data: `reject_${id}`  },
  ]]}}),
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const html  = { parse_mode: 'HTML' };
const send  = (to, text, opts = {}) =>
  bot.sendMessage(to, text, { ...html, ...opts }).catch(e => console.error('[send]', e.message));

function upsertUser(msg) {
  const id = String(msg.chat.id);
  if (!db.users[id]) {
    db.users[id] = {
      id,
      name: (`${msg.from.first_name || ''} ${msg.from.last_name || ''}`).trim() || '—',
      un:   msg.from.username || null,
      at:   Date.now(),
      s:    'new',
    };
    saveDB();
  }
  return db.users[id];
}

function buildReceiptNotif(user, chatId, text) {
  const tag  = `👤 <b>${user.name}</b>${user.un ? ` (@${user.un})` : ''}\n🆔 <code>${chatId}</code>`;
  const body = text ? `\n\n📝 <i>${text}</i>` : '\n📎 فایل یا عکس';
  return `🔔 <b>رسید جدید</b>\n\n${tag}${body}`;
}

async function notifyAdmin(chatId, caption, msg) {
  const opts = { parse_mode: 'HTML', ...K.action(chatId) };
  if (msg.photo) {
    return bot.sendPhoto(ADMIN, msg.photo[msg.photo.length - 1].file_id, { caption, ...opts });
  } else if (msg.document) {
    return bot.sendDocument(ADMIN, msg.document.file_id, { caption, ...opts });
  } else if (msg.video) {
    return bot.sendVideo(ADMIN, msg.video.file_id, { caption, ...opts });
  } else {
    return send(ADMIN, caption, K.action(chatId));
  }
}

// ── /start ────────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  if (isAdmin(msg.chat.id)) return send(ADMIN, T.help);
  const u     = upsertUser(msg);
  const first = u.name.split(' ')[0];
  send(msg.chat.id, T.start(first), K.main);
});

// ── Admin Commands ─────────────────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  send(ADMIN, T.help);
});

bot.onText(/\/stats/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  send(ADMIN, T.stats());
});

bot.onText(/\/cancel/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  if (adminMode) { adminMode = null; return send(ADMIN, '🚫 عملیات کنسل شد.'); }
  send(ADMIN, 'عملیات فعالی وجود نداره.');
});

bot.onText(/\/users/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  const list = Object.values(db.users)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20)
    .map((u, i) => `${i + 1}. ${u.name} ${u.un ? `@${u.un}` : ''} — <code>${u.id}</code> [${u.s}]`)
    .join('\n');
  send(ADMIN, list ? `👥 <b>آخرین کاربران:</b>\n\n${list}` : 'هنوز کاربری ثبت نشده.');
});

// /setfile [file_id] یا بدون آرگومان → فایل بعدی رو ثبت می‌کنه
bot.onText(/\/setfile(?:\s+(.+))?/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  if (match[1]) {
    db.fileId = match[1].trim();
    saveDB();
    return send(ADMIN, `✅ File ID ثبت شد:\n<code>${db.fileId}</code>`);
  }
  adminMode = 'setfile';
  send(ADMIN, '📎 الان فایل هبیت‌ترکر رو اینجا بفرست.');
});

// /broadcast → پیام بعدی (متن، عکس یا فایل) به همه کاربران ارسال میشه
bot.onText(/\/broadcast/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  adminMode = 'broadcast';
  send(ADMIN, '📢 پیامت رو بفرست (متن، عکس یا فایل).\n\n/cancel برای انصراف.');
});

// ── Callbacks ─────────────────────────────────────────────────────────────────
bot.on('callback_query', async (q) => {
  const chatId = String(q.message.chat.id);
  const data   = q.data;

  if (data.startsWith('approve_') || data.startsWith('reject_')) {
    bot.answerCallbackQuery(q.id, { text: '✓ اجرا شد' }).catch(() => {});
    return adminAction(q, data.startsWith('approve_'));
  }

  bot.answerCallbackQuery(q.id).catch(() => {});
  if (!antiFlood(chatId)) return;

  switch (data) {
    case 'buy':     return send(chatId, T.buy);
    case 'howto':   return send(chatId, T.howto, K.toBuy);
    case 'support': return send(chatId, T.support);
  }
});

// ── Message Handler ────────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = String(msg.chat.id);
  const text   = msg.text || '';

  if (text.startsWith('/')) return; // دستورات رو bot.onText مدیریت می‌کنه

  // ── پیام‌های ادمین ──────────────────────────────────────────────────────────
  if (isAdmin(chatId)) {

    // ثبت فایل هبیت‌ترکر
    if (adminMode === 'setfile' && msg.document) {
      db.fileId = msg.document.file_id;
      adminMode = null;
      saveDB();
      return send(ADMIN, `✅ فایل ثبت شد!\n<code>${db.fileId}</code>`);
    }

    // ارسال بردکست
    if (adminMode === 'broadcast') {
      adminMode     = null;
      const users   = Object.values(db.users);
      if (!users.length) return send(ADMIN, '⚠️ هنوز کاربری ثبت نشده.');

      send(ADMIN, `📤 در حال ارسال به ${users.length} نفر...`);
      let ok = 0, fail = 0;

      for (const u of users) {
        try {
          if (msg.photo) {
            await bot.sendPhoto(u.id, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption || '', ...html });
          } else if (msg.document) {
            await bot.sendDocument(u.id, msg.document.file_id, { caption: msg.caption || '', ...html });
          } else if (msg.video) {
            await bot.sendVideo(u.id, msg.video.file_id, { caption: msg.caption || '', ...html });
          } else {
            await bot.sendMessage(u.id, text, html);
          }
          ok++;
        } catch { fail++; }
        await new Promise(r => setTimeout(r, 50)); // rate-limit تلگرام
      }

      return send(ADMIN, `✅ ارسال تموم شد\n\n✔️ موفق: ${ok}  |  ❌ خطا: ${fail}`);
    }

    // اگر ادمین فایل فرستاد بدون /setfile → File ID رو نشون بده
    if (msg.document) {
      send(ADMIN, `📎 <b>File ID:</b>\n<code>${msg.document.file_id}</code>\n\nبرای ثبت: /setfile`);
    }
    return;
  }

  // ── پیام کاربر (رسید) ──────────────────────────────────────────────────────
  if (!antiFlood(chatId)) return;

  const user = upsertUser(msg);
  if (user.s === 'new') { user.s = 'pending'; saveDB(); }

  send(chatId, T.got);

  const caption = buildReceiptNotif(user, chatId, text);
  notifyAdmin(chatId, caption, msg).catch(e => console.error('[notify]', e.message));
});

// ── Admin Action (تایید/رد) ───────────────────────────────────────────────────
async function adminAction(q, isApprove) {
  const userId = q.data.split('_')[1];
  const msgId  = q.message.message_id;
  const label  = isApprove ? '✅ تایید شد.' : '❌ رد شد.';

  // ویرایش پیام ادمین
  const hasCaption = q.message.caption !== undefined;
  (hasCaption ? bot.editMessageCaption : bot.editMessageText)
    .call(bot, label, { chat_id: ADMIN, message_id: msgId })
    .catch(() => {});

  if (isApprove) {
    await send(userId, T.done);
    if (db.fileId) {
      bot.sendDocument(userId, db.fileId, { caption: '🎁 هبیت‌ترکر شیترا' })
        .catch(e => console.error('[sendDoc]', e.message));
    } else {
      send(userId, T.nofile);
    }
    if (db.users[userId]) db.users[userId].s = 'approved';
    db.approved++;

  } else {
    send(userId, T.nope);
    if (db.users[userId]) db.users[userId].s = 'rejected';
    db.rejected++;
  }

  saveDB();
}

// ── Errors ────────────────────────────────────────────────────────────────────
bot.on('polling_error', e => console.error('[poll]', e.message));
bot.on('error',         e => console.error('[bot]',  e.message));

console.log('🚀 شیترا آنلاین شد.');