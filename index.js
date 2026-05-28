const TelegramBot = require('node-telegram-bot-api');

// بررسی وجود متغیرهای حیاتی در پنل Railway برای جلوگیری از کرش
if (!process.env.BOT_TOKEN || !process.env.ADMIN_CHAT_ID) {
  console.error('❌ خطا: متغیرهای BOT_TOKEN یا ADMIN_CHAT_ID در پنل Railway تعریف نشده‌اند!');
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
const habitFileId = process.env.HABIT_FILE_ID || null;

const bot = new TelegramBot(token, { polling: true });

// --- مدیریت متن پیام‌ها (Premium Copywriting) ---
const MESSAGES = {
  welcome: `<b>سلام رفیق! 👋</b>\n\nبه <b>شیترا</b> خوش اومدی. اینجا قراره با هم کنترل زمان، اهداف و عادت‌هامون رو به دست بگیریم و به منظم‌ترین نسخه خودمون تبدیل بشیم.\n\nاز منوی زیر انتخاب کن چطور می‌تونم تو این مسیر کمکت کنم:`,
  
  buyHabit: `<b>🎯 شروع یک تغییر بزرگ (سرمایه‌گذاری روی خودت!)</b>\n\nبا داشتن این هبیت‌ترکر، مسیر رسیدن به اهدافت شفاف‌تر، منظم‌تر و لذت‌بخش‌تر از همیشه میشه. وقتش رسیده که به کارهات نظم بدی. ✨\n\n💳 <b>مبلغ سرمایه‌گذاری:</b> ۲۴۹,۰۰۰ تومان\n🏦 <b>شماره کارت:</b> <code>5022291569609694</code>\n👤 <b>به نام:</b> صالحی\n\n<i>👈 روی شماره کارت ضربه بزن تا به راحتی کپی بشه.</i>\n\nبعد از واریز، کافیه <b>شماره پیگیری، شناسه پرداخت یا عکس رسید</b> رو همینجا برام بفرستی تا بلافاصله فایل و راهنما برات ارسال بشه. 🚀`,
  
  tutorials: `<b>📚 راهنمای مسیر شیترا</b>\n\nبرای اینکه بتونی بالاترین بازدهی رو از پلنرها ببری، ویدیوهای آموزشی کوتاه، کاربردی و قدم‌به‌قدم برات آماده کردیم که به زودی همینجا قرار می‌گیرن. دست پر برمی‌گردیم! 🎥`,
  
  support: `<b>👨‍💻 پشتیبانی شیترا</b>\n\nسوالی داری، نیاز به راهنمایی داری یا در فرآیند پرداخت به مشکلی خوردی؟ با خیال راحت به آیدی زیر پیام بده، همیشه کنارتیم:\n\n🆔 @sheetra_support`,
  
  receiptProcessing: `<b>✅ دریافت شد!</b>\n\nکد یا رسید شما با موفقیت ثبت شد و در صف بررسی قرار گرفت. به محض تایید تراکنش توسط تیم شیترا، فایل هبیت‌ترکر همینجا به صورت خودکار برات ارسال میشه. ممنون از صبوری و اعتمادت! 💙`,
  
  purchaseApproved: `<b>🎉 تراکنش شما تایید شد!</b>\n\nممنون از سرمایه‌گذاری ارزشمندی که روی نظم و آینده خودت کردی. در ادامه فایل هبیت‌ترکر به همراه دسترسی‌های لازم برات ارسال میشه. تو مسیر ساخت عادت‌های جدید موفق باشی! 🚀`,
  
  purchaseRejected: `<b>❌ عدم تایید تراکنش</b>\n\nمتأسفانه اطلاعات یا رسید ارسالی شما مورد تایید قرار نگرفت. لطفاً شماره پیگیری صحیح را ارسال کنید یا جهت بررسی بیشتر با پشتیبانی در ارتباط باشید:\n🆔 @sheetra_support`
};

// --- دکمه‌های شیشه‌ای منوی اصلی ---
const KEYBOARDS = {
  mainMenu: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎯 دریافت هبیت ترکر و شروع تغییر', callback_data: 'buy_habit' }],
        [{ text: '💡 چطور از پلنرها استفاده کنم؟', callback_data: 'tutorials' }],
        [{ text: '💬 ارتباط مستقیم با پشتیبانی', callback_data: 'support' }]
      ]
    }
  }
};

// --- دستور /start ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, MESSAGES.welcome, {
    parse_mode: 'HTML',
    ...KEYBOARDS.mainMenu
  }).catch((err) => console.error('Error welcome:', err.message));
});

// --- مدیریت کلیک روی دکمه‌های منوی اصلی کاربر ---
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // مدیریت دکمه‌های بخش مدیریت (ادمین)
  if (data.startsWith('approve_') || data.startsWith('reject_')) {
    handleAdminCallback(query);
    return;
  }

  // دکمه‌های معمولی کاربر
  switch (data) {
    case 'buy_habit':
      bot.sendMessage(chatId, MESSAGES.buyHabit, { parse_mode: 'HTML' });
      break;
    case 'tutorials':
      bot.sendMessage(chatId, MESSAGES.tutorials, { parse_mode: 'HTML' });
      break;
    case 'support':
      bot.sendMessage(chatId, MESSAGES.support, { parse_mode: 'HTML' });
      break;
  }
  
  bot.answerCallbackQuery(query.id).catch((err) => console.error(err.message));
});

// --- دریافت رسید (متن یا عکس) و ارجاع به ادمین ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;
  const username = msg.from.username ? `@${msg.from.username}` : 'بدون آیدی';
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  if (userText && userText.startsWith('/')) return;
  
  // اگر پیام از طرف خود ادمین بود
  if (String(chatId) === String(adminChatId)) {
    // اگر ادمین فایلی فرستاد، شناسه فایل رو توی لاگ‌های Railway چاپ کن
    if (msg.document) {
      console.log(`📌 File ID شناسایی شد: ${msg.document.file_id}`);
    }
    return; 
  }

  // بررسی ارسال رسید
  const isTextReceipt = userText && /^[0-9\u06F0-\u06F9\u0660-\u0669\s-]{6,}$/.test(userText.trim());
  const isPhotoReceipt = msg.photo;

  if (isTextReceipt || isPhotoReceipt) {
    bot.sendMessage(chatId, MESSAGES.receiptProcessing, { parse_mode: 'HTML' });

    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ تایید و ارسال فایل', callback_data: `approve_${chatId}` },
            { text: '❌ رد تراکنش', callback_data: `reject_${chatId}` }
          ]
        ]
      }
    };

    const adminReportText = `🔔 <b>رسید جدید پرداخت!</b>\n\n👤 <b>کاربر:</b> ${fullName} (${username})\n🆔 <b>شناسه کاربر:</b> <code>${chatId}</code>\n📝 <b>توضیحات/کد:</b> ${userText || 'ارسال شده در قالب عکس'}`;

    if (isPhotoReceipt) {
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      bot.sendPhoto(adminChatId, photoId, {
        caption: adminReportText,
        parse_mode: 'HTML',
        ...adminKeyboard
      });
    } else {
      bot.sendMessage(adminChatId, adminReportText, {
        parse_mode: 'HTML',
        ...adminKeyboard
      });
    }
  }
});

// --- مدیریت کلیک ادمین روی دکمه‌های تایید یا رد ---
function handleAdminCallback(query) {
  const adminAction = query.data;
  const [action, targetUserId] = adminAction.split('_');
  
  if (action === 'approve') {
    bot.sendMessage(targetUserId, MESSAGES.purchaseApproved, { parse_mode: 'HTML' })
      .then(() => {
        if (habitFileId && habitFileId !== '123') {
          bot.sendDocument(targetUserId, habitFileId, { caption: '🎁 فایل هبیت‌ترکر شیترا' });
        } else {
          bot.sendMessage(targetUserId, `⚠️ فایل هبیت‌ترکر هنوز روی سیستم پیکربندی نشده است. لطفا به پشتیبانی پیام دهید.`);
        }
      });

    bot.editMessageCaption(`✅ این رسید تایید شد و فایل برای کاربر ارسال گردید.`, {
      chat_id: adminChatId,
      message_id: query.message.message_id
    }).catch(() => {
      bot.editMessageText(`✅ این رسید تایید شد و فایل برای کاربر ارسال گردید.`, {
        chat_id: adminChatId,
        message_id: query.message.message_id
      });
    });

  } else if (action === 'reject') {
    bot.sendMessage(targetUserId, MESSAGES.purchaseRejected, { parse_mode: 'HTML' });

    bot.editMessageCaption(`❌ این تراکنش توسط شما رد شد.`, {
      chat_id: adminChatId,
      message_id: query.message.message_id
    }).catch(() => {
      bot.editMessageText(`❌ این تراکنش توسط شما رد شد.`, {
        chat_id: adminChatId,
        message_id: query.message.message_id
      });
    });
  }

  bot.answerCallbackQuery(query.id, { text: 'دستور اجرا شد' });
}

// --- خطایابی شبکه ---
bot.on('polling_error', (err) => console.warn(`[Polling Error]: ${err.message}`));
bot.on('error', (err) => console.error(`[Bot Error]: ${err.message}`));

console.log('🤖 ربات شیترا با موفقیت روی Railway راه‌اندازی شد...');