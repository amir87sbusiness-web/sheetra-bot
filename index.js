require('dotenv').config(); // پیشنهاد می‌کنم از dotenv برای مدیریت توکن استفاده کنی
const TelegramBot = require('node-telegram-bot-api');

// توکن ربات رو از فایل .env می‌خونیم
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// --- مدیریت متن پیام‌ها (Copywriting) ---
// متن‌ها طوری طراحی شدن که حس بهره‌وری، نظم و ارزش رو منتقل کنن
const MESSAGES = {
  welcome: `<b>سلام رفیق! 👋</b>\n\nبه <b>شیترا</b> خوش اومدی. اینجا قراره با هم کنترل زمان و عادت‌هامون رو به دست بگیریم و به بهترین نسخه خودمون تبدیل بشیم.\n\nاز منوی زیر انتخاب کن چطور می‌تونم تو این مسیر کمکت کنم:`,
  
  buyHabit: `<b>✨ سرمایه‌گذاری روی خودت!</b>\n\nبا داشتن این هبیت‌ترکر، مسیر رسیدن به اهدافت شفاف‌تر، منظم‌تر و لذت‌بخش‌تر میشه. \n\n💳 <b>مبلغ سرمایه‌گذاری:</b> ۲۴۹,۰۰۰ تومان\n🏦 <b>شماره کارت:</b> <code>5022291569609694</code> (به نام صالحی)\n\n<i>👈 روی شماره کارت کلیک کن تا کپی بشه.</i>\n\nبعد از واریز، کافیه <b>شماره پیگیری</b> رو همینجا برام بفرستی تا بلافاصله فایل و دسترسی‌ها برات ارسال بشه. 🚀`,
  
  tutorials: `<b>📚 راهنمای مسیر</b>\n\nبرای اینکه بتونی بیشترین استفاده رو از پلنرها ببری، ویدیوهای آموزشی کوتاه و کاربردی برات آماده کردیم که به زودی همینجا قرار می‌گیرن. 🎥`,
  
  support: `<b>👨‍💻 ما همیشه کنارتیم</b>\n\nسوالی داری یا تو مسیر استفاده از شیترا نیاز به راهنمایی هست؟ با خیال راحت به پشتیبانی پیام بده:\n\n🆔 @sheetra_support`,
  
  receiptProcessing: `<b>✅ دریافت شد!</b>\n\nکد پیگیری شما در صف بررسی قرار گرفت. به محض تایید تراکنش، فایل هبیت‌ترکر همینجا برات ارسال میشه. ممنون از اعتمادت به شیترا! 💙`
};

// --- منوی شیشه‌ای (Inline Buttons) ---
const KEYBOARDS = {
  mainMenu: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎯 شروع تغییر (دریافت هبیت ترکر)', callback_data: 'buy_habit' }],
        [{ text: '💡 چطور از پلنرها استفاده کنم؟', callback_data: 'tutorials' }],
        [{ text: '💬 ارتباط مستقیم با پشتیبانی', callback_data: 'support' }]
      ]
    }
  }
};

// --- هندل کردن دستور /start ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  // ارسال پیام با فرمت HTML برای زیبایی بیشتر
  bot.sendMessage(chatId, MESSAGES.welcome, {
    parse_mode: 'HTML',
    ...KEYBOARDS.mainMenu
  });
});

// --- مدیریت کلیک روی دکمه‌های شیشه‌ای ---
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // با استفاده از Switch Case کد خواناتر میشه
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
  
  // حذف حالت لودینگ (ساعت شنی) از روی دکمه در کلاینت تلگرام
  bot.answerCallbackQuery(query.id);
});

// --- دریافت و بررسی شماره پیگیری ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // مطمئن میشیم که پیام متنیه و دستور (مثل /start) نیست
  if (text && !text.startsWith('/')) {
    // بررسی اینکه آیا کاربر حداقل یک عدد ۶ رقمی (یا بیشتر) فرستاده یا نه
    // اعداد فارسی و انگلیسی رو پوشش میده در صورت نیاز، ولی فعلا روی دکیت‌های استاندارد تمرکز داره
    if (/^\d{6,}$/.test(text.trim())) {
      bot.sendMessage(chatId, MESSAGES.receiptProcessing, { parse_mode: 'HTML' });
      
      // اینجا می‌تونی در آینده کدی اضافه کنی که این شماره پیگیری رو به 
      // دیتابیس (مثل Supabase) یا یک گروه ادمین بفرسته تا اونجا تاییدش کنی.
    }
  }
});

console.log('🤖 ربات شیترا با موفقیت راه‌اندازی شد...');