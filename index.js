const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// بررسی متغیرهای حیاتی محیطی
if (!process.env.BOT_TOKEN || !process.env.ADMIN_CHAT_ID) {
  console.error('❌ خطا: متغیرهای BOT_TOKEN یا ADMIN_CHAT_ID تعریف نشده‌اند!');
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
const adminChatId = String(process.env.ADMIN_CHAT_ID);
const bot = new TelegramBot(token, { polling: true });

const DATA_PATH = path.join(__dirname, 'data.json');

// ساختار داده‌های پیش‌فرض ربات
let botData = {
  products: {},
  settings: {
    cardNo: "5022291569609694",
    cardName: "صالحی",
    welcome: "<b>سلام {name} عزیز 🌹</b>\n\nبه <b>شیترا</b> خوش آمدید. ما به شما کمک می‌کنیم تا با ابزارهای هوشمند، مدیریت زمان، اهداف و عادت‌های خود را به دست بگیرید.\n\nلطفاً از منوی زیر مسیر خود را انتخاب کنید:",
    tutorials: "<b>💡 راهنمای استفاده از پلنرها</b>\n\nاستفاده از قالب‌های شیترا بسیار ساده است و نیازی به دانش فرمول‌نویسی ندارد:\n\n1️⃣ <b>دسترسی سریع:</b> فایل را روی موبایل، تبلت یا لپ‌تاپ باز کنید.\n2️⃣ <b>شخصی‌سازی:</b> اهداف و عادت‌های خود را وارد کنید.\n3️⃣ <b>رشد مستمر:</b> روزانه عملکرد خود را تیک بزنید تا نمودارهای تحلیلی و پیشرفت شما خودکار رسم شوند.\n\n🎥 یک ویدیو آموزشی کوتاه (زیر ۵ دقیقه) نیز همراه فایل‌ها ارسال می‌شود.",
    support: "<b>💬 پشتیبانی و ارتباط مستقیم</b>\n\nسوالی دارید یا نیازمند راهنمایی هستید؟ تیم پشتیبانی شیترا در کنار شماست:\n\n🆔 @sheetra_support",
    approved: "<b>🎉 پرداخت شما تایید شد!</b>\n\nممنون از اعتمادتان و سرمایه‌گذاری ارزشمندی که برای نظم شخصی خود انجام دادید. فایل محصول در ادامه برای شما ارسال می‌شود. موفق باشید! 🚀",
    rejected: "<b>❌ عدم تایید تراکنش</b>\n\nمتأسفانه رسید یا اطلاعات ارسالی شما مورد تایید قرار نگرفت. لطفاً رسید صحیح را ارسال کنید یا با پشتیبانی در ارتباط باشید:\n🆔 @sheetra_support"
  }
};

// بارگذاری داده‌ها از فایل
if (fs.existsSync(DATA_PATH)) {
  try {
    botData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error("Error reading data.json, using defaults", e);
  }
}

// ذخیره داده‌ها
function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(botData, null, 2), 'utf8');
}

// مدیریت وضعیت ادمین (State Machine)
const adminStates = {};

// کیبوردهای ثابت ادمین
const ADMIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: '📦 مدیریت محصولات' }, { text: '📝 ویرایش متن‌های ربات' }],
      [{ text: '💳 تنظیمات کارت بانکی' }, { text: '❌ خروج از پنل' }]
    ],
    resize_keyboard: true
  }
};

// --- منوهای اصلی کاربر ---
function getMainMenu(firstName) {
  const welcomeText = botData.settings.welcome.replace('{name}', firstName || 'کاربر');
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📚 مشاهده و دریافت پلنرها', callback_markup: {}, callback_data: 'user_products' }],
        [{ text: '💡 راهنمای استفاده', callback_data: 'user_tutorials' }, { text: '💬 پشتیبانی', callback_data: 'user_support' }]
      ]
    }
  };
  return { text: welcomeText, keyboard };
}

// --- دستور /start ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  // اگر کاربر ادمین بود، دکمه ورود به پنل ادمین را هم نشان بده
  if (String(chatId) === adminChatId) {
    bot.sendMessage(chatId, `🛠 <b>به پنل مدیریت شیترا خوش آمدید.</b>\nجهت استفاده از ابزارهای مدیریت، از نوار ابزار دکمه‌های زیر استفاده کنید.`, {
      parse_mode: 'HTML',
      ...ADMIN_KEYBOARD
    });
  }
  
  const menu = getMainMenu(msg.from.first_name);
  bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', ...menu.keyboard })
    .catch((err) => console.error(err.message));
});

// --- دستور ورود به پنل ادمین ---
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== adminChatId) return;
  
  bot.sendMessage(chatId, '🛠 نوار ابزار مدیریت ادمین فعال شد:', ADMIN_KEYBOARD);
});

// --- مدیریت پیام‌های متنی و منطق ادمین ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userIdStr = String(chatId);

  // صرف نظر از دستورات اصلی
  if (text && text.startsWith('/')) return;

  // منطق بخش کاربری (دریافت رسید)
  if (userIdStr !== adminChatId) {
    handleUserReceipt(msg);
    return;
  }

  // --- جریان ادمین (پیام‌های دریافتی از ادمین) ---
  if (adminStates[chatId]) {
    handleAdminWorkflow(msg);
    return;
  }

  // ناوبری منوی اصلی ادمین
  switch (text) {
    case '📦 مدیریت محصولات':
      showAdminProductsMenu(chatId);
      break;
    case '📝 ویرایش متن‌های ربات':
      showAdminSettingsMenu(chatId);
      break;
    case '💳 تنظیمات کارت بانکی':
      adminStates[chatId] = { type: 'EDIT_CARD_NO' };
      bot.sendMessage(chatId, `💳 شماره کارت فعلی: <code>${botData.settings.cardNo}</code>\n\nشماره کارت جدید ۱۶ رقمی را بفرستید:`, { parse_mode: 'HTML' });
      break;
    case '❌ خروج از پنل':
      bot.sendMessage(chatId, '⚙️ پنل مدیریت بسته شد. برای باز کردن مجدد /admin را بفرستید.', {
        reply_markup: { remove_keyboard: true }
      });
      break;
  }
});

// --- مدیریت کلیک روی دکمه‌های شیشه‌ای (Callback Queries) ---
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const msgId = query.message.message_id;

  bot.answerCallbackQuery(query.id).catch(() => {});

  // دکمه‌های بخش کاربری
  if (data === 'user_products') {
    const pKeys = Object.keys(botData.products);
    if (pKeys.length === 0) {
      bot.sendMessage(chatId, '⚠️ در حال حاضر محصولی برای نمایش وجود ندارد.');
      return;
    }
    const inline_keyboard = pKeys.map(id => ([{ text: `🎯 ${botData.products[id].name}`, callback_data: `view_p_${id}` }]));
    inline_keyboard.push([{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_to_main' }]);
    
    bot.editMessageText('📚 <b>لیست پلنرها و محصولات شیترا:</b>\n\nمحصول مورد نظر خود را جهت مشاهده جزئیات انتخاب کنید:', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard }
    }).catch(() => {});
  }
  
  else if (data === 'back_to_main') {
    const menu = getMainMenu(query.from.first_name);
    bot.editMessageText(menu.text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: menu.keyboard.reply_markup
    }).catch(() => {});
  }

  else if (data === 'user_tutorials') {
    bot.sendMessage(chatId, botData.settings.tutorials, { parse_mode: 'HTML' });
  }

  else if (data === 'user_support') {
    bot.sendMessage(chatId, botData.settings.support, { parse_mode: 'HTML' });
  }

  else if (data.startsWith('view_p_')) {
    const pId = data.replace('view_p_', '');
    const product = botData.products[pId];
    if (!product) return;

    const infoText = `<b>🎯 ${product.name}</b>\n\n${product.description}\n\n💳 <b>مبلغ سرمایه‌گذاری:</b> ${product.price} تومان\n🏦 <b>شماره کارت:</b> <code>${botData.settings.cardNo}</code>\n👤 <b>به نام:</b> ${botData.settings.cardName}\n\n<i>👈 روی شماره کارت ضربه بزنید تا کپی شود.</i>\n\nپس از واریز، <b>رسید پرداخت، اسکرین‌شات یا مشخصات تراکنش</b> را همین‌جا ارسال کنید تا به صورت خودکار فایل برای شما ارسال شود. ✨`;

    if (product.photoId) {
      bot.sendPhoto(chatId, product.photoId, { caption: infoText, parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
    }
  }

  // --- دکمه‌های بخش مدیریت و ادمین ---
  if (String(chatId) !== adminChatId) return;

  if (data.startsWith('adm_del_')) {
    const pId = data.replace('adm_del_', '');
    delete botData.products[pId];
    saveData();
    bot.sendMessage(chatId, '✅ محصول با موفقیت حذف شد.');
    showAdminProductsMenu(chatId);
  }

  else if (data.startsWith('adm_edit_')) {
    const pId = data.replace('adm_edit_', '');
    adminStates[chatId] = { type: 'EDIT_PRODUCT_NAME', pId };
    bot.sendMessage(chatId, `✍️ نام جدید محصول را ارسال کنید:`);
  }

  else if (data === 'adm_add_product') {
    adminStates[chatId] = { type: 'ADD_PRODUCT_NAME' };
    bot.sendMessage(chatId, '🆕 <b>مراحل افزودن محصول جدید</b>\n\nلطفاً <b>نام محصول</b> را ارسال کنید:');
  }

  else if (data.startsWith('set_text_')) {
    const settingKey = data.replace('set_text_', '');
    adminStates[chatId] = { type: 'EDIT_SETTING_TEXT', key: settingKey };
    bot.sendMessage(chatId, `✍️ متن جدید مربوط به این بخش را ارسال کنید. (شما می‌توانید از تگ‌های HTML استفاده کنید. در متن خوش‌آمدگویی عبارت <code>{name}</code> با اسم کاربر جایگزین می‌شود):\n\nمتن فعلی:\n${botData.settings[settingKey]}`);
  }

  // تایید یا رد تراکنش‌های کاربران توسط ادمین
  else if (data.startsWith('approve_')) {
    const parts = data.split('_');
    const targetUserId = parts[1];
    const pId = parts[2];
    const product = botData.products[pId];

    bot.sendMessage(targetUserId, botData.settings.approved, { parse_mode: 'HTML' })
      .then(() => {
        if (product && product.fileId) {
          bot.sendDocument(targetUserId, product.fileId, { caption: `🎁 فایل محصول: ${product.name}` });
        } else {
          bot.sendMessage(targetUserId, `⚠️ فایل این محصول توسط ادمین آپلود نشده است. لطفا با پشتیبانی در ارتباط باشید.`);
        }
      });

    bot.editMessageCaption(query.message.caption + `\n\n✅ <b>تراکنش تایید و محصول ارسال شد.</b>`, {
      chat_id: adminChatId,
      message_id: msgId,
      parse_mode: 'HTML'
    }).catch(() => {
      bot.editMessageText(query.message.text + `\n\n✅ <b>تراکنش تایید و محصول ارسال شد.</b>`, {
        chat_id: adminChatId,
        message_id: msgId,
        parse_mode: 'HTML'
      });
    });
  }

  else if (data.startsWith('reject_')) {
    const parts = data.split('_');
    const targetUserId = parts[1];
    bot.sendMessage(targetUserId, botData.settings.rejected, { parse_mode: 'HTML' });

    bot.editMessageCaption(query.message.caption + `\n\n❌ <b>تراکنش رد شد.</b>`, {
      chat_id: adminChatId,
      message_id: msgId,
      parse_mode: 'HTML'
    }).catch(() => {
      bot.editMessageText(query.message.text + `\n\n❌ <b>تراکنش رد شد.</b>`, {
        chat_id: adminChatId,
        message_id: msgId,
        parse_mode: 'HTML'
      });
    });
  }
});

// --- مدیریت منوهای ادمین ---
function showAdminProductsMenu(chatId) {
  const pKeys = Object.keys(botData.products);
  let msgText = '📦 <b>مدیریت محصولات شیترا</b>\n\n';
  const inline_keyboard = [];

  if (pKeys.length === 0) {
    msgText += 'هیچ محصولی تعریف نشده است.';
  } else {
    pKeys.forEach(id => {
      const p = botData.products[id];
      msgText += `🔹 <b>${p.name}</b> - قیمت: ${p.price} تومان\n`;
      inline_keyboard.push([
        { text: `✏️ ویرایش ${p.name}`, callback_data: `adm_edit_${id}` },
        { text: `🗑 حذف`, callback_data: `adm_del_${id}` }
      ]);
    });
  }

  inline_keyboard.push([{ text: '➕ افزودن محصول جدید', callback_data: 'adm_add_product' }]);

  bot.sendMessage(chatId, msgText, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard }
  });
}

function showAdminSettingsMenu(chatId) {
  const inline_keyboard = [
    [{ text: '👋 متن خوش‌آمدگویی (/start)', callback_data: 'set_text_welcome' }],
    [{ text: '💡 متن راهنما', callback_data: 'set_text_tutorials' }],
    [{ text: '💬 متن پشتیبانی', callback_data: 'set_text_support' }],
    [{ text: '✅ متن تایید پرداخت', callback_data: 'set_text_approved' }],
    [{ text: '❌ متن رد پرداخت', callback_data: 'set_text_rejected' }]
  ];

  bot.sendMessage(chatId, '📝 <b>تنظیمات متون ربات</b>\nبخش مورد نظر خود را جهت ویرایش انتخاب کنید:', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard }
  });
}

// --- ماشین وضعیت فرآیندهای ادمین ---
function handleAdminWorkflow(msg) {
  const chatId = msg.chat.id;
  const state = adminStates[chatId];
  const text = msg.text;

  switch (state.type) {
    // افزودن محصول جدید
    case 'ADD_PRODUCT_NAME':
      adminStates[chatId] = { type: 'ADD_PRODUCT_PRICE', name: text };
      bot.sendMessage(chatId, `💰 قیمت محصول <b>${text}</b> را به «تومان» وارد کنید (مثال: 249000):`, { parse_mode: 'HTML' });
      break;

    case 'ADD_PRODUCT_PRICE':
      adminStates[chatId] = { ...state, type: 'ADD_PRODUCT_DESC', price: text };
      bot.sendMessage(chatId, `✍️ توضیحات و ویژگی‌های محصول را ارسال کنید:`);
      break;

    case 'ADD_PRODUCT_DESC':
      adminStates[chatId] = { ...state, type: 'ADD_PRODUCT_PHOTO', description: text };
      bot.sendMessage(chatId, `📸 یک <b>عکس</b> برای محصول ارسال کنید. (اگر مایل به گذاشتن عکس نیستید دستور /skip را بفرستید):`, { parse_mode: 'HTML' });
      break;

    case 'ADD_PRODUCT_PHOTO':
      if (msg.photo) {
        state.photoId = msg.photo[msg.photo.length - 1].file_id;
      }
      adminStates[chatId] = { ...state, type: 'ADD_PRODUCT_FILE' };
      bot.sendMessage(chatId, `📁 عالیه! حالا <b>فایل اصلی محصول</b> (مانند Zip, Excel و...) را ارسال کنید تا سیستم پس از خرید خودکار برای کاربر بفرستد:`);
      break;

    case 'ADD_PRODUCT_FILE':
      if (!msg.document) {
        bot.sendMessage(chatId, `⚠️ لطفا فایل محصول را به صورت Document یا فایل ارسال کنید:`);
        return;
      }
      const newId = 'p_' + Date.now();
      botData.products[newId] = {
        name: state.name,
        price: state.price,
        description: state.description,
        photoId: state.photoId || null,
        fileId: msg.document.file_id
      };
      saveData();
      delete adminStates[chatId];
      bot.sendMessage(chatId, '🎉 محصول جدید با موفقیت اضافه شد و به منو پیوست شد!');
      showAdminProductsMenu(chatId);
      break;

    // ویرایش محصول موجود
    case 'EDIT_PRODUCT_NAME':
      adminStates[chatId] = { type: 'EDIT_PRODUCT_PRICE', pId: state.pId, name: text };
      bot.sendMessage(chatId, `💰 قیمت جدید را به «تومان» وارد کنید:`);
      break;

    case 'EDIT_PRODUCT_PRICE':
      adminStates[chatId] = { ...state, type: 'EDIT_PRODUCT_DESC', price: text };
      bot.sendMessage(chatId, `✍️ توضیحات جدید را ارسال کنید:`);
      break;

    case 'EDIT_PRODUCT_DESC':
      adminStates[chatId] = { ...state, type: 'EDIT_PRODUCT_PHOTO', description: text };
      bot.sendMessage(chatId, `📸 عکس جدید را ارسال کنید (یا برای عدم تغییر عکس /skip بفرستید):`);
      break;

    case 'EDIT_PRODUCT_PHOTO':
      if (msg.photo) {
        state.photoId = msg.photo[msg.photo.length - 1].file_id;
      }
      adminStates[chatId] = { ...state, type: 'EDIT_PRODUCT_FILE' };
      bot.sendMessage(chatId, `📁 فایل جدید محصول را ارسال کنید (یا برای عدم تغییر فایل قبلی /skip بفرستید):`);
      break;

    case 'EDIT_PRODUCT_FILE':
      const currentProduct = botData.products[state.pId];
      botData.products[state.pId] = {
        name: state.name,
        price: state.price,
        description: state.description,
        photoId: state.photoId || currentProduct.photoId,
        fileId: msg.document ? msg.document.file_id : currentProduct.fileId
      };
      saveData();
      delete adminStates[chatId];
      bot.sendMessage(chatId, '✅ محصول با موفقیت ویرایش و به‌روزرسانی شد.');
      showAdminProductsMenu(chatId);
      break;

    // تنظیمات متون عمومی
    case 'EDIT_SETTING_TEXT':
      botData.settings[state.key] = text;
      saveData();
      delete adminStates[chatId];
      bot.sendMessage(chatId, '✅ تغییرات متن با موفقیت ذخیره شد.');
      showAdminSettingsMenu(chatId);
      break;

    case 'EDIT_CARD_NO':
      adminStates[chatId] = { type: 'EDIT_CARD_NAME', cardNo: text };
      bot.sendMessage(chatId, `👤 نام صاحب حساب جدید کارت را وارد کنید:`);
      break;

    case 'EDIT_CARD_NAME':
      botData.settings.cardNo = state.cardNo;
      botData.settings.cardName = text;
      saveData();
      delete adminStates[chatId];
      bot.sendMessage(chatId, '💳 اطلاعات حساب بانکی با موفقیت به‌روزرسانی شد.');
      break;
  }
}

// اگر ادمین تمایل به ارسال عکس یا فایل جدید نداشت
bot.onText(/\/skip/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== adminChatId || !adminStates[chatId]) return;

  const state = adminStates[chatId];
  if (state.type === 'ADD_PRODUCT_PHOTO') {
    adminStates[chatId] = { ...state, type: 'ADD_PRODUCT_FILE' };
    bot.sendMessage(chatId, `📁 دستور نادیده‌گرفتن عکس ثبت شد. حالا <b>فایل اصلی محصول</b> را ارسال کنید:`);
  } else if (state.type === 'EDIT_PRODUCT_PHOTO') {
    adminStates[chatId] = { ...state, type: 'EDIT_PRODUCT_FILE' };
    bot.sendMessage(chatId, `📁 دستور نادیده‌گرفتن عکس ثبت شد. فایل جدید را ارسال کنید (یا با /skip فایل قبلی را حفظ کنید):`);
  } else if (state.type === 'EDIT_PRODUCT_FILE') {
    const currentProduct = botData.products[state.pId];
    botData.products[state.pId] = {
      name: state.name,
      price: state.price,
      description: state.description,
      photoId: state.photoId || currentProduct.photoId,
      fileId: currentProduct.fileId
    };
    saveData();
    delete adminStates[chatId];
    bot.sendMessage(chatId, '✅ تغییرات محصول (بدون تغییر فایل قبلی) اعمال شد.');
    showAdminProductsMenu(chatId);
  }
});

// --- مدیریت رسیدهای کاربران ---
function handleUserReceipt(msg) {
  const chatId = msg.chat.id;
  const userText = msg.text;
  const username = msg.from.username ? `@${msg.from.username}` : 'بدون آیدی';
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  // پیدا کردن آخرین محصولی که کاربر احتمالاً در حال خرید آن بوده است (از طریق استخراج نام محصولات)
  // به عنوان یک راهکار ساده و پایدار، لیست کلید محصولات را می‌فرستیم تا ادمین مشخص کند برای کدام محصول است.
  bot.sendMessage(chatId, `<b>✅ رسید شما دریافت شد!</b>\n\nاطلاعات ارسالی در صف بررسی قرار گرفت. به محض تایید تراکنش توسط مدیریت شیترا، فایل محصول به صورت خودکار برای شما همینجا ارسال خواهد شد.`, { parse_mode: 'HTML' });

  // برای ساده‌تر شدن تصمیم‌گیری ادمین، کلیدهای تایید به همراه شناسه تمام محصولات داینامیک ساخته می‌شود
  const pKeys = Object.keys(botData.products);
  const adminKeyboard = { inline_keyboard: [] };

  pKeys.forEach(pId => {
    adminKeyboard.inline_keyboard.push([
      { text: `✅ تایید و ارسال [${botData.products[pId].name}]`, callback_data: `approve_${chatId}_${pId}` }
    ]);
  });
  adminKeyboard.inline_keyboard.push([{ text: '❌ رد کل تراکنش', callback_data: `reject_${chatId}_none` }]);

  const baseReportText = `🔔 <b>رسید یا پیام پرداخت جدید!</b>\n\n👤 <b>کاربر:</b> ${fullName} (${username})\n🆔 <b>شناسه کاربر:</b> <code>${chatId}</code>`;
  const textDetails = userText ? `\n📝 <b>متن ارسال شده:</b>\n<code>${userText}</code>` : '\n📝 <b>نوع رسید:</b> عکس یا فایل رسانه‌ای';
  const adminReportText = baseReportText + textDetails + `\n\n👇 ادمین عزیز، جهت تایید، محصول خریداری شده را انتخاب کنید:`;

  if (msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    bot.sendPhoto(adminChatId, photoId, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard });
  } else if (msg.document) {
    bot.sendDocument(adminChatId, msg.document.file_id, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard });
  } else {
    bot.sendMessage(adminChatId, adminReportText, { parse_mode: 'HTML', reply_markup: adminKeyboard });
  }
}

// بررسی ارورها جهت عدم کرش ربات
bot.on('polling_error', (err) => console.warn(`[Polling Error]: ${err.message}`));
bot.on('error', (err) => console.error(`[Bot Error]: ${err.message}`));

console.log('🤖 ربات هوشمند و داینامیک شیترا آماده به کار است...');
