require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// بررسی وجود توکن برای جلوگیری از خطاهای مبهم
if (!process.env.BOT_TOKEN) {
  console.error('❌ خطا: BOT_TOKEN در متغیرهای محیطی (Environment Variables) تعریف نشده است!');
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// --- مدیریت متن پیام‌ها (Premium Copywriting) ---
const MESSAGES = {
  welcome: `<b>سلام رفیق! 👋</b>\n\nبه <b>شیترا</b> خوش اومدی. اینجا قراره با هم کنترل زمان، اهداف و عادت‌هامون رو به دست بگیریم و به منظم‌ترین نسخه خودمون تبدیل بشیم.\n\nاز منوی زیر انتخاب کن چطور می‌تونم تو این مسیر کمکت کنم:`,
  
  buyHabit: `<b>🎯 شروع یک تغییر بزرگ (سرمایه‌گذاری روی خودت!)</b>\n\nبا داشتن این هبیت‌ترکر، مسیر رسیدن به اهدافت شفاف‌تر، منظم‌تر و لذت‌بخش‌تر از همیشه میشه. وقتش رسیده که به کارهات نظم بدی. ✨\n\n💳 <b>مبلغ سرمایه‌گذاری:</b> ۲۴۹,۰۰۰ تومان\n🏦 <b>شماره کارت:</b> <code>5022291569609694</code>\n👤 <b>به نام:</b> صالحی\n\n<i>👈 روی شماره کارت ضربه بزن تا به راحتی کپی بشه.</i>\n\nبعد از واریز، کافیه <b>شماره پیگیری یا شناسه پرداخت</b> رو همینجا برام بفرستی تا بلافاصله فایل و راهنما برات ارسال بشه. 🚀`,
  
  tutorials: `<b>📚 راهنمای مسیر شیترا</b>\n\nبرای اینکه بتونی بالاترین بازدهی رو از پلنرها ببری، ویدیوهای آموزشی کوتاه، کاربردی و قدم‌به‌قدم برات آماده کردیم که به زودی همینجا قرار می‌گیرن. دست پر برمی‌گردیم! 🎥`,
  
  support: `<b>👨‍💻 پشتیبانی شیترا</b>\n\nسوالی داری، نیاز به راهنمایی داری یا در فرآیند پرداخت به مشکلی خوردی؟ با خیال راحت به آیدی زیر پیام بده، همیشه کنارتیم:\n\n🆔 @sheetra_support`,
  
  receiptProcessing: `<b>✅ دریافت شد!</b>\n\nکد پیگیری شما با موفقیت ثبت شد و در صف بررسی قرار گرفت. به محض تایید تراکنش، فایل هبیت‌ترکر همینجا برات ارسال میشه. ممنون از اینکه برای رشد خودت شیترا رو انتخاب کردی! 💙`
};

// --- دکمه‌های شیشه‌ای (Inline Keyboards) ---
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
  }).catch((err) => console.error('Error sending welcome message:', err.message));
});

// --- مدیریت کلیک روی دکمه‌ها ---
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

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
  
  // حذف دائم حالت لودینگ از روی دکمه
  bot.answerCallbackQuery(query.id).catch((err) => console.error('Error answering callback:', err.message));
});

// --- دریافت شماره پیگیری (پشتیبانی از کیبورد فارسی و انگلیسی) ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // مطمئن می‌شویم متن است و دستور تلگرامی نیست
  if (text && !text.startsWith('/')) {
    
    // رگکس پیشرفته برای تشخیص حداقل ۶ رقم متوالی (پشتیبانی کامل از اعداد انگلیسی، فارسی و عربی)
    const trackingRegex = /^[0-9\u06F0-\u06F9\u0660-\u0669]{6,}$/;
    
    if (trackingRegex.test(text.trim())) {
      bot.sendMessage(chatId, MESSAGES.receiptProcessing, { parse_mode: 'HTML' });
      
      // ایده برای آینده: اینجا می‌تونی شماره پیگیری رو به همراه شناسه کاربر (chatId) 
      // به دیتابیس بفرستی یا به گروه تلگرام ادمین‌ها فوروارد کنی.
    }
  }
});

// --- سیستم ضد کرش فوق‌حرفه‌ای (Error Handling) ---
// این بخش از قطع شدن ربات به خاطر خطاهای شبکه یا فیلترینگ جلوگیری میکنه
bot.on('polling_error', (error) => {
  console.warn(`[Polling Error] کد خطا: ${error.code} | پیام: ${error.message}`);
});

bot.on('error', (error) => {
  console.error(`[General Bot Error]: ${error.message}`);
});

console.log('🤖 ربات شیترا با ساختار بهینه و بدون نقص راه‌اندازی شد...');