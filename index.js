const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// وضعیت کاربران
const userStates = {};

// منوی اصلی
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '🎁 دریافت هبیت ترکر' }],
      [{ text: '📚 آموزش استفاده از پلنرها' }, { text: '👨‍💻 ارتباط با پشتیبانی' }]
    ],
    resize_keyboard: true
  }
};

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "سلام! به ربات شیترا خوش اومدی. چطور می‌تونم کمکت کنم؟", mainMenu);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🎁 دریافت هبیت ترکر') {
    userStates[chatId] = 'WAITING_FOR_PAYMENT';
    bot.sendMessage(chatId, `
عالی! برای دریافت هبیت ترکر، مبلغ 249,000 تومان را به این شماره واریز کن:
💳 5022-2915-6960-9694
به نام: صالحی

بعد از واریز، **شماره پیگیری** یا **شماره ارجاع** تراکنش را فقط به صورت عدد (مثلا 123456) بفرست تا فایل رو برات بفرستم.`);
  } 
  
  else if (userStates[chatId] === 'WAITING_FOR_PAYMENT') {
    const trackingCode = text.trim();
    
    // اینجا در آینده کد اتصال به دیتابیسِ پیامک‌های شما قرار می‌گیرد
    // فعلا فرض می‌کنیم تراکنش با موفقیت تایید شده است
    
    bot.sendMessage(chatId, `✅ فیش شما بررسی و تایید شد!
📥 لینک دانلود هبیت ترکر:
https://sheetra-products.s3.ir-thr-at1.arvanstorage.ir/habit-tracker%20.pdf?versionId=
ممنون که از شیترا خرید کردی! 💪`, mainMenu);
    
    userStates[chatId] = null;
  }
  
  else if (text === '👨‍💻 ارتباط با پشتیبانی') {
    bot.sendMessage(chatId, "مشکلی داشتی یا سوالی هست، پیام بده به: @sheetra_support");
  }
});