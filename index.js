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
    cardName: "امیر صالحی",
    welcome: "<b>خوش اومدی {name} 👋</b>\n\nبه <b>شیترا</b> خوش آمدید. ما به شما کمک می‌کنیم تا با ابزارهای هوشمند، مدیریت زمان، اهداف و عادت‌های خود را به دست بگیرید.\n\nلطفاً از منوی زیر مسیر خود را انتخاب کنید:",
    tutorials: "<b>💡 راهنمای استفاده از پلنرها</b>\n\nاستفاده از قالب‌های شیترا بسیار ساده است و نیازی به دانش فرمول‌نویسی ندارد:\n\n1️⃣ <b>دسترسی سریع:</b> فایل را روی موبایل، تبلت یا لپ‌تاپ باز کنید.\n2️⃣ <b>شخصی‌سازی:</b> اهداف و عادت‌های خود را وارد کنید.\n3️⃣ <b>رشد مستمر:</b> روزانه عملکرد خود را تیک بزنید تا نمودارهای تحلیلی و پیشرفت شما خودکار رسم شوند.\n\n🎥 یک ویدیو آموزشی کوتاه نیز همراه فایل‌ها ارسال می‌شود.",
    support: "<b>💬 پشتیبانی و ارتباط مستقیم</b>\n\nسوالی دارید یا نیازمند راهنمایی هستید؟ تیم پشتیبانی شیترا در کنار شماست:\n\n🆔 @sheetra_support",
    approved: "<b>🎉 پرداخت شما تایید شد!</b>\n\nممنون از اعتمادتان و سرمایه‌گذاری ارزشمندی که برای نظم شخصی خود انجام دادید. فایل‌های محصول در ادامه برای شما ارسال می‌شود. موفق باشید! 🚀",
    rejected: "<b>❌ عدم تایید تراکنش</b>\n\nمتأسفانه رسید یا اطلاعات ارسالی شما مورد تایید قرار نگرفت. لطفاً رسید صحیح را ارسال کنید یا با پشتیبانی در ارتباط باشید:\n🆔 @sheetra_support"
  }
};

// بارگذاری داده‌ها + ارتقاء خودکار ساختار محصولات قدیمی به چند رسانه‌ای و چند فایلی
if (fs.existsSync(DATA_PATH)) {
  try {
    botData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    // Migration script
    Object.keys(botData.products).forEach(id => {
      const p = botData.products[id];
      if (!p.media) p.media = p.photoId ? [{ type: 'photo', media: p.photoId }] : [];
      if (!p.fileIds) p.fileIds = p.fileId ? [p.fileId] : [];
    });
  } catch (e) {
    console.error("Error reading data.json, using defaults", e);
  }
}

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(botData, null, 2), 'utf8');
}

const adminStates = {};

// منوی اصلی شیشه‌ای ادمین
const ADMIN_MAIN_MENU = {
  inline_keyboard: [
    [{ text: '📦 مدیریت محصولات', callback_data: 'adm_menu_products' }, { text: '📝 متون ربات', callback_data: 'adm_menu_texts' }],
    [{ text: '💳 تنظیمات کارت', callback_data: 'adm_menu_card' }, { text: '❌ بستن پنل', callback_data: 'adm_menu_close' }]
  ]
};

// تابع محاسبه زمان باقی‌مانده از چرخه ۴ ساعته تخفیف
function getDiscountTimerString() {
  const now = new Date();
  const currentHour = now.getHours();
  const nextIntervalHour = Math.ceil((currentHour + 0.01) / 4) * 4 % 24;
  
  let nextReset = new Date(now);
  nextReset.setHours(nextIntervalHour === 0 ? 24 : nextIntervalHour, 0, 0, 0);
  
  const diffMs = nextReset - now;
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;
  
  return `${hours} ساعت و ${minutes} دقیقه`;
}

// تابع تبدیل اعداد به فرمت پولی خوانا
function formatPrice(price) {
  return String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// --- منوهای اصلی کاربر ---
function getMainMenu(firstName) {
  const welcomeText = botData.settings.welcome.replace('{name}', firstName || 'کاربر');
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📚 مشاهده و دریافت پلنرها', callback_data: 'user_products' }],
        [{ text: '💡 راهنمای استفاده', callback_data: 'user_tutorials' }, { text: '💬 پشتیبانی', callback_data: 'user_support' }]
      ]
    }
  };
  return { text: welcomeText, keyboard };
}

// --- دستور /start ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const menu = getMainMenu(msg.from.first_name);
  bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', ...menu.keyboard }).catch(() => {});
});

// --- دستور ورود به پنل ادمین ---
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== adminChatId) return;
  
  bot.sendMessage(chatId, '🛠 <b>پنل مدیریت هوشمند شیترا</b>\nاز گزینه‌های زیر استفاده کنید:', { parse_mode: 'HTML', reply_markup: ADMIN_MAIN_MENU });
});

// --- مدیریت پیام‌های متنی و منطق ادمین ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text && text.startsWith('/')) return;

  if (String(chatId) !== adminChatId) {
    handleUserReceipt(msg);
    return;
  }

  if (adminStates[chatId]) {
    handleAdminWorkflow(msg);
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
    
    const normalProducts = pKeys.filter(id => !botData.products[id].isCombo);
    const comboProducts = pKeys.filter(id => botData.products[id].isCombo);
    const sortedKeys = [...normalProducts, ...comboProducts];

    const inline_keyboard = sortedKeys.map(id => {
      const p = botData.products[id];
      const icon = p.isCombo ? '🎁' : '🎯';
      return [{ text: `${icon} ${p.name} | ${formatPrice(p.price)} تومان`, callback_data: `view_p_${id}` }];
    });
    
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

    const formattedOriginal = formatPrice(product.originalPrice || product.price);
    const formattedDiscount = formatPrice(product.price);
    const timerText = getDiscountTimerString();

    const infoText = `<b>${product.isCombo ? '🎁' : '🎯'} ${product.name}</b>\n\n${product.description}\n\n❌ قیمت اصلی: <s>${formattedOriginal} تومان</s>\n🔥 <b>قیمت ویژه با تخفیف:</b> ${formattedDiscount} تومان\n\n⏳ <b>تخفیفت از بین میره:</b> <code>${timerText}</code>\n\n🏦 <b>شماره کارت:</b> <code>${botData.settings.cardNo}</code>\n👤 <b>به نام:</b> ${botData.settings.cardName}\n\n<i>👈 روی شماره کارت ضربه بزنید تا کپی شود.</i>\n\nپس از واریز، <b>رسید پرداخت</b> را همین‌جا ارسال کنید. ✨`;

    if (product.media && product.media.length > 0) {
      if (product.media.length === 1) {
        if (product.media[0].type === 'photo') {
          bot.sendPhoto(chatId, product.media[0].media, { caption: infoText, parse_mode: 'HTML' });
        } else {
          bot.sendVideo(chatId, product.media[0].media, { caption: infoText, parse_mode: 'HTML' });
        }
      } else {
        // ارسال به صورت آلبوم برای چند رسانه
        const mediaGroup = product.media.map((m, index) => ({
          type: m.type,
          media: m.media,
          caption: index === 0 ? infoText : '',
          parse_mode: 'HTML'
        }));
        bot.sendMediaGroup(chatId, mediaGroup).catch(() => {
          bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' }); // Fallback
        });
      }
    } else {
      bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
    }
  }

  // --- دکمه‌های بخش مدیریت و ادمین ---
  if (String(chatId) !== adminChatId) return;

  if (data === 'adm_menu_close') {
    bot.deleteMessage(chatId, msgId).catch(() => {});
  }
  else if (data === 'adm_menu_products') {
    showAdminProductsMenu(chatId, msgId);
  }
  else if (data === 'adm_menu_texts') {
    showAdminSettingsMenu(chatId, msgId);
  }
  else if (data === 'adm_menu_card') {
    adminStates[chatId] = { type: 'EDIT_CARD_NO' };
    bot.sendMessage(chatId, `💳 شماره کارت فعلی: <code>${botData.settings.cardNo}</code>\n\nشماره کارت جدید ۱۶ رقمی را بفرستید:`, { parse_mode: 'HTML' });
  }

  else if (data.startsWith('adm_del_')) {
    const pId = data.replace('adm_del_', '');
    delete botData.products[pId];
    saveData();
    bot.answerCallbackQuery(query.id, { text: '✅ محصول با موفقیت حذف شد.', show_alert: true });
    showAdminProductsMenu(chatId, msgId);
  }

  else if (data === 'adm_add_product' || data === 'adm_add_combo') {
    adminStates[chatId] = { type: 'ADD_PRODUCT_NAME', isCombo: data === 'adm_add_combo', media: [], fileIds: [] };
    bot.sendMessage(chatId, `🆕 لطفاً <b>نام ${data === 'adm_add_combo' ? 'بسته ترکیبی' : 'محصول'}</b> را بفرستید:`, { parse_mode: 'HTML' });
  }

  else if (data === 'state_next_files') {
    if(adminStates[chatId]) {
      adminStates[chatId].type = 'ADD_PRODUCT_FILE';
      bot.sendMessage(chatId, `📁 عالی. حالا <b>فایل‌های محصول/بسته</b> را ارسال کنید. (می‌توانید چند فایل پشت سر هم بفرستید)`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ اتمام و ذخیره نهایی', callback_data: 'state_finish_product' }]] }
      });
    }
  }

  else if (data === 'state_finish_product') {
    if(adminStates[chatId]) {
      const state = adminStates[chatId];
      const newId = 'p_' + Date.now();
      botData.products[newId] = {
        name: state.name,
        originalPrice: state.originalPrice,
        price: state.price,
        description: state.description,
        media: state.media,
        fileIds: state.fileIds,
        isCombo: state.isCombo
      };
      saveData();
      delete adminStates[chatId];
      bot.sendMessage(chatId, '🎉 محصول/بسته جدید با موفقیت ایجاد و ذخیره شد!');
      showAdminProductsMenu(chatId);
    }
  }

  // --- منوی ویرایش نقطه‌ای ---
  else if (data.startsWith('adm_editmenu_')) {
    const pId = data.replace('adm_editmenu_', '');
    showEditProductMenu(chatId, pId, msgId);
  }

  else if (data.startsWith('editp_')) {
    const parts = data.split('_');
    const action = parts[1];
    const pId = parts.slice(2).join('_');
    const p = botData.products[pId];

    if (action === 'clearmedia') {
      p.media = [];
      saveData();
      bot.answerCallbackQuery(query.id, { text: '✅ گالری رسانه‌ها پاک شد.', show_alert: true });
      showEditProductMenu(chatId, pId, msgId);
      return;
    } 
    else if (action === 'clearfile') {
      p.fileIds = [];
      saveData();
      bot.answerCallbackQuery(query.id, { text: '✅ فایل‌های این محصول پاک شد.', show_alert: true });
      showEditProductMenu(chatId, pId, msgId);
      return;
    }

    adminStates[chatId] = { type: 'EDIT_FIELD', field: action, pId: pId };
    
    let promptText = '';
    if (action === 'name') promptText = '✍️ نام جدید را ارسال کنید:';
    else if (action === 'origprice') promptText = '❌ قیمت اصلی جدید (بدون تخفیف) را ارسال کنید:';
    else if (action === 'price') promptText = '🔥 قیمت ویژه جدید را ارسال کنید:';
    else if (action === 'desc') promptText = '📝 توضیحات کامل جدید را ارسال کنید:';
    else if (action === 'addmedia') promptText = '🖼 عکس یا ویدیو جدید را ارسال کنید (می‌توانید پشت سر هم چندتا بفرستید):';
    else if (action === 'addfile') promptText = '📁 فایل جدید را ارسال کنید (می‌توانید پشت سر هم چندتا بفرستید):';

    bot.sendMessage(chatId, promptText, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف و بازگشت', callback_data: `adm_editmenu_${pId}` }]] }
    });
  }

  else if (data.startsWith('set_text_')) {
    const settingKey = data.replace('set_text_', '');
    adminStates[chatId] = { type: 'EDIT_SETTING_TEXT', key: settingKey };
    bot.sendMessage(chatId, `✍️ متن جدید مربوط به این بخش را ارسال کنید:\n\nمتن فعلی:\n${botData.settings[settingKey]}`, { parse_mode: 'HTML' });
  }

  // تایید یا رد تراکنش‌های کاربران توسط ادمین
  else if (data.startsWith('approve_')) {
    const parts = data.split('_');
    const targetUserId = parts[1];
    
    const pId = parts.slice(2).join('_'); 
    const product = botData.products[pId];

    bot.sendMessage(targetUserId, botData.settings.approved, { parse_mode: 'HTML' })
      .then(() => {
        if (product && product.fileIds && product.fileIds.length > 0) {
          product.fileIds.forEach((fId, index) => {
            bot.sendDocument(targetUserId, fId, { caption: `🎁 فایل محصول (${index + 1} از ${product.fileIds.length}): ${product.name}` });
          });
        } else {
          bot.sendMessage(targetUserId, `⚠️ فایل این محصول توسط ادمین آپلود نشده است. با پشتیبانی در ارتباط باشید.`);
        }
      });

    // حذف دکمه‌های تایید و ثبت وضعیت روی پیام رسید
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: adminChatId, message_id: msgId });
    bot.sendMessage(adminChatId, `✅ <b>تراکنش تایید شد و فایل(ها) ارسال گردید.</b>`, { reply_to_message_id: msgId, parse_mode: 'HTML' });
  }

  else if (data.startsWith('reject_')) {
    const targetUserId = data.split('_')[1];
    bot.sendMessage(targetUserId, botData.settings.rejected, { parse_mode: 'HTML' });

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: adminChatId, message_id: msgId });
    bot.sendMessage(adminChatId, `❌ <b>تراکنش رد شد.</b>`, { reply_to_message_id: msgId, parse_mode: 'HTML' });
  }
});

// --- مدیریت منوهای ادمین ---
function showAdminProductsMenu(chatId, msgId = null) {
  const pKeys = Object.keys(botData.products);
  const inline_keyboard = [];

  const normalProducts = pKeys.filter(id => !botData.products[id].isCombo);
  const comboProducts = pKeys.filter(id => botData.products[id].isCombo);
  const sortedKeys = [...normalProducts, ...comboProducts];

  sortedKeys.forEach(id => {
    const p = botData.products[id];
    inline_keyboard.push([
      { text: `${p.isCombo ? '🎁' : '🔹'} ${p.name}`, callback_data: `adm_editmenu_${id}` },
      { text: `🗑 حذف`, callback_data: `adm_del_${id}` }
    ]);
  });

  inline_keyboard.push([
    { text: '➕ افزودن محصول', callback_data: 'adm_add_product' },
    { text: '🎁 افزودن بسته ترکیبی', callback_data: 'adm_add_combo' }
  ]);
  
  inline_keyboard.push([{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'adm_menu_close' }]);

  const options = { parse_mode: 'HTML', reply_markup: { inline_keyboard } };
  const text = '📦 <b>مدیریت محصولات و بسته‌های شیترا</b>\nبرای ویرایش یا مشاهده گزینه‌ها، روی نام هرکدام کلیک کنید:';
  
  if (msgId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...options }).catch(() => bot.sendMessage(chatId, text, options));
  } else {
    bot.sendMessage(chatId, text, options);
  }
}

function showEditProductMenu(chatId, pId, msgId) {
  const p = botData.products[pId];
  if (!p) return;
  
  const kb = {
    inline_keyboard: [
      [{ text: '✏️ نام', callback_data: `editp_name_${pId}` }, { text: '📝 توضیحات', callback_data: `editp_desc_${pId}` }],
      [{ text: '❌ قیمت اصلی', callback_data: `editp_origprice_${pId}` }, { text: '🔥 قیمت ویژه', callback_data: `editp_price_${pId}` }],
      [{ text: `🖼 افزودن رسانه (${p.media.length})`, callback_data: `editp_addmedia_${pId}` }, { text: '🗑 پاکسازی گالری', callback_data: `editp_clearmedia_${pId}` }],
      [{ text: `📁 افزودن فایل (${p.fileIds.length})`, callback_data: `editp_addfile_${pId}` }, { text: '🗑 پاکسازی فایل‌ها', callback_data: `editp_clearfile_${pId}` }],
      [{ text: '🔙 بازگشت به لیست محصولات', callback_data: 'adm_menu_products' }]
    ]
  };
  
  const text = `🛠 <b>بخش ویرایش: ${p.name}</b>\nدقیقاً فیلدی که می‌خواهید تغییر دهید را انتخاب کنید:`;
  bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb });
}

function showAdminSettingsMenu(chatId, msgId) {
  const inline_keyboard = [
    [{ text: '👋 متن خوش‌آمدگویی', callback_data: 'set_text_welcome' }, { text: '💡 متن راهنما', callback_data: 'set_text_tutorials' }],
    [{ text: '💬 متن پشتیبانی', callback_data: 'set_text_support' }],
    [{ text: '✅ متن تایید پرداخت', callback_data: 'set_text_approved' }, { text: '❌ متن رد پرداخت', callback_data: 'set_text_rejected' }],
    [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'adm_menu_close' }]
  ];

  bot.editMessageText('📝 <b>تنظیمات متون ربات</b>\nبخش مورد نظر را انتخاب کنید:', {
    chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard }
  });
}

// --- ماشین وضعیت فرآیندهای ادمین ---
function handleAdminWorkflow(msg) {
  const chatId = msg.chat.id;
  const state = adminStates[chatId];
  const text = msg.text;

  // جریان ایجاد محصول جدید
  if (state.type.startsWith('ADD_PRODUCT_')) {
    switch (state.type) {
      case 'ADD_PRODUCT_NAME':
        state.type = 'ADD_PRODUCT_ORIGINAL_PRICE'; state.name = text;
        bot.sendMessage(chatId, `❌ <b>قیمت اصلی و بدون تخفیف</b> را به تومان وارد کنید:`, { parse_mode: 'HTML' });
        break;
      case 'ADD_PRODUCT_ORIGINAL_PRICE':
        state.type = 'ADD_PRODUCT_PRICE'; state.originalPrice = text;
        bot.sendMessage(chatId, `🔥 حالا <b>قیمت نهایی با تخفیف ویژه</b> را وارد کنید:`, { parse_mode: 'HTML' });
        break;
      case 'ADD_PRODUCT_PRICE':
        state.type = 'ADD_PRODUCT_DESC'; state.price = text;
        bot.sendMessage(chatId, `✍️ توضیحات و ویژگی‌های کامل را ارسال کنید:`);
        break;
      case 'ADD_PRODUCT_DESC':
        state.type = 'ADD_PRODUCT_MEDIA'; state.description = text;
        bot.sendMessage(chatId, `🖼 حالا <b>عکس‌ها یا ویدیوها</b> را ارسال کنید (در صورت عدم نیاز روی دکمه رد کردن کلیک کنید):`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '➡️ رفتن به مرحله فایل‌ها', callback_data: 'state_next_files' }]] }
        });
        break;
      case 'ADD_PRODUCT_MEDIA':
        if (msg.photo) state.media.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
        else if (msg.video) state.media.push({ type: 'video', media: msg.video.file_id });
        
        bot.sendMessage(chatId, `✅ رسانه دریافت شد. عکس/فیلم بعدی را بفرستید یا روی رفتن به مرحله بعد کلیک کنید:`, {
          reply_markup: { inline_keyboard: [[{ text: '➡️ رفتن به مرحله فایل‌ها', callback_data: 'state_next_files' }]] }
        });
        break;
      case 'ADD_PRODUCT_FILE':
        if (msg.document) state.fileIds.push(msg.document.file_id);
        
        bot.sendMessage(chatId, `✅ فایل دریافت شد. فایل بعدی را بفرستید یا روی اتمام کلیک کنید:`, {
          reply_markup: { inline_keyboard: [[{ text: '✅ اتمام و ذخیره نهایی', callback_data: 'state_finish_product' }]] }
        });
        break;
    }
  } 
  
  // جریان ویرایش نقطه‌ای محصول
  else if (state.type === 'EDIT_FIELD') {
    const p = botData.products[state.pId];
    
    if (state.field === 'name') p.name = text;
    else if (state.field === 'origprice') p.originalPrice = text;
    else if (state.field === 'price') p.price = text;
    else if (state.field === 'desc') p.description = text;
    else if (state.field === 'addmedia') {
      if (msg.photo) p.media.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
      else if (msg.video) p.media.push({ type: 'video', media: msg.video.file_id });
    }
    else if (state.field === 'addfile') {
      if (msg.document) p.fileIds.push(msg.document.file_id);
    }
    
    saveData();
    const isAddingMultiple = state.field === 'addmedia' || state.field === 'addfile';
    
    bot.sendMessage(chatId, `✅ اعمال شد. ${isAddingMultiple ? 'میتوانید موارد بیشتری بفرستید یا برگردید.' : ''}`, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منوی ویرایش این محصول', callback_data: `adm_editmenu_${state.pId}` }]] }
    });
    
    // اگر در حال وارد کردن متن بودیم، state را ببندیم. اما برای مدیا/فایل باز بگذاریم تا بتواند چندتا بفرستد.
    if (!isAddingMultiple) delete adminStates[chatId];
  }
  
  // تنظیمات دیگر
  else if (state.type === 'EDIT_SETTING_TEXT') {
    botData.settings[state.key] = text;
    saveData();
    delete adminStates[chatId];
    bot.sendMessage(chatId, '✅ تغییرات متن با موفقیت ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU });
  }

  else if (state.type === 'EDIT_CARD_NO') {
    adminStates[chatId] = { type: 'EDIT_CARD_NAME', cardNo: text };
    bot.sendMessage(chatId, `👤 نام صاحب حساب جدید را وارد کنید:`);
  }

  else if (state.type === 'EDIT_CARD_NAME') {
    botData.settings.cardNo = state.cardNo;
    botData.settings.cardName = text;
    saveData();
    delete adminStates[chatId];
    bot.sendMessage(chatId, '💳 اطلاعات حساب بانکی با موفقیت به‌روزرسانی شد.', { reply_markup: ADMIN_MAIN_MENU });
  }
}

// --- مدیریت رسیدهای کاربران ---
function handleUserReceipt(msg) {
  const chatId = msg.chat.id;
  const userText = msg.text;
  const username = msg.from.username ? `@${msg.from.username}` : 'بدون آیدی';
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  bot.sendMessage(chatId, `<b>✅ رسید شما دریافت شد!</b>\n\nبه محض تایید تراکنش توسط پشتیبانی شیترا، فایل‌ها به صورت خودکار برای شما همینجا ارسال خواهند شد.`, { parse_mode: 'HTML' });

  const pKeys = Object.keys(botData.products);
  const adminKeyboard = { inline_keyboard: [] };

  pKeys.forEach(pId => {
    adminKeyboard.inline_keyboard.push([
      { text: `✅ تایید و ارسال [${botData.products[pId].name}]`, callback_data: `approve_${chatId}_${pId}` }
    ]);
  });
  adminKeyboard.inline_keyboard.push([{ text: '❌ رد کل تراکنش', callback_data: `reject_${chatId}_none` }]);

  const baseReportText = `🔔 <b>رسید یا پیام پرداخت جدید!</b>\n\n👤 <b>کاربر:</b> ${fullName} (${username})\n🆔 <b>شناسه کاربر:</b> <code>${chatId}</code>`;
  const textDetails = userText ? `\n📝 <b>متن ارسال شده:</b>\n<code>${userText}</code>` : '\n📝 <b>نوع رسید:</b> رسانه / فایل';
  const adminReportText = baseReportText + textDetails + `\n\n👇 جهت تایید، محصول خریداری شده را انتخاب کنید:`;

  if (msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    bot.sendPhoto(adminChatId, photoId, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard });
  } else if (msg.document) {
    bot.sendDocument(adminChatId, msg.document.file_id, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard });
  } else {
    bot.sendMessage(adminChatId, adminReportText, { parse_mode: 'HTML', reply_markup: adminKeyboard });
  }
}

bot.on('polling_error', (err) => console.warn(`[Polling Error]: ${err.message}`));
bot.on('error', (err) => console.error(`[Bot Error]: ${err.message}`));

console.log('🤖 ربات هوشمند و داینامیک شیترا آماده به کار است...');
