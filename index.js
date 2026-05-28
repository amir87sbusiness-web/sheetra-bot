const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// --- منوی شیشه‌ای (Inline Buttons) ---
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🎁 دریافت هبیت ترکر', callback_data: 'buy_habit' }],
      [{ text: '📚 آموزش استفاده از پلنرها', callback_data: 'tutorials' }],
      [{ text: '👨‍💻 ارتباط با پشتیبانی', callback_data: 'support' }]
    ]
  }
};

// پیام استارت با دکمه‌های حرفه‌ای
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "سلام رفیق! به دنیای شیترا خوش اومدی. 🚀\nانتخاب کن که چطور می‌تونم کمکت کنم:", mainMenu);
});

// مدیریت کلیک روی دکمه‌ها
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'buy_habit') {
    bot.sendMessage(chatId, `عالی! برای دریافت هبیت ترکر، مبلغ ۲۴۹,۰۰۰ تومان رو به این شماره کارت واریز کن:
💳 5022-2915-6960-9694
به نام: صالحی

بعد از واریز، شماره پیگیری رو همینجا بفرست تا فایل برات ارسال بشه.`);
  } 
  else if (data === 'support') {
    bot.sendMessage(chatId, "آیدی پشتیبانی شیترا:\n@sheetra_support");
  }
  else if (data === 'tutorials') {
    bot.sendMessage(chatId, "ویدیوهای آموزشی به زودی در این بخش قرار می‌گیرن! 🎥");
  }
  
  // حذف حالت لودینگ از روی دکمه
  bot.answerCallbackQuery(query.id);
});

// دریافت شماره پیگیری (که کاربر تایپ می‌کنه)
bot.on('message', (msg) => {
  if (msg.text && !msg.text.startsWith('/')) {
    // اینجا چک می‌کنیم اگه کاربر عدد فرستاد، یعنی کد پیگیریه
    if (/^\d{6,}$/.test(msg.text)) {
      bot.sendMessage(msg.chat.id, "✅ دریافت شد! در حال بررسی تراکنش... \nاگر تایید بشه، فایل رو برات می‌فرستم.");
    }
  }
});