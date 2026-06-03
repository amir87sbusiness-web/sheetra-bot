const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

if (!process.env.BOT_TOKEN || !process.env.ADMIN_CHAT_ID) {
  console.error('❌ خطا: متغیرهای BOT_TOKEN یا ADMIN_CHAT_ID تعریف نشده‌اند!');
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
const adminChatId = String(process.env.ADMIN_CHAT_ID);
const bot = new TelegramBot(token, { polling: true });

const DATA_PATH = path.join(__dirname, 'data', 'data.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const PROJECT_FILES_TO_BACKUP = [
  path.join(__dirname, 'index.js'),
  path.join(__dirname, 'package.json'),
  DATA_PATH
];

function getTehranDateInfo() {
  const now = new Date();
  const optionsDate = { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' };
  const optionsTime = { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return {
    dateStr: new Intl.DateTimeFormat('en-GB', optionsDate).format(now),
    timeStr: new Intl.DateTimeFormat('en-GB', optionsTime).format(now)
  };
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price) {
  const n = Number(String(price).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n)) return String(price || '');
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function parseNumeric(value, fallback = 0) {
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMediaArray(media) {
  if (!Array.isArray(media)) return [];
  return media
    .filter(m => m && (m.type === 'photo' || m.type === 'video') && m.media)
    .map(m => ({ type: m.type, media: String(m.media) }));
}

function normalizeFilesArray(files) {
  if (!Array.isArray(files)) return [];
  return files.filter(Boolean).map(String);
}

function createDefaultData() {
  return {
    products: {},
    settings: {
      cardNo: '5022291569609694',
      cardName: 'امیر صالحی',
      welcome: '<b>خوش اومدی {name} 👋</b>\n\nبه <b>شیترا</b> خوش آمدید. لطفاً از منوی زیر مسیر خود را انتخاب کنید:',
      tutorials: '<b>💡 راهنمای استفاده</b>\n\nفایل را باز کنید، اطلاعات خود را وارد کنید و از آن استفاده کنید.',
      support: '<b>💬 پشتیبانی و ارتباط مستقیم</b>\n\n🆔 @sheetra_support',
      approved: '<b>🎉 پرداخت شما تایید شد!</b>\n\nفایل‌ها در ادامه برای شما ارسال می‌شود.',
      rejected: '<b>❌ عدم تایید تراکنش</b>\n\nلطفاً رسید صحیح را ارسال کنید یا با پشتیبانی در ارتباط باشید:\n🆔 @sheetra_support',
      noProductsText: '⚠️ در حال حاضر محصولی برای نمایش وجود ندارد.',
      productsMenuTitle: '📚 <b>لیست محصولات</b>\n\nمحصول مورد نظر خود را انتخاب کنید:',
      productsMenuBannerMedia: []
    },
    stats: {
      totalStarts: 0,
      totalPurchases: 0,
      uniqueUsers: {},
      daily: {
        date: getTehranDateInfo().dateStr,
        starts: 0,
        newUsers: 0,
        purchases: 0,
        reported: false
      }
    },
    buttonStats: {
      user_products: 0,
      user_tutorials: 0,
      user_support: 0,
      products: {}
    }
  };
}

function normalizeProduct(p, index = 0) {
  const product = {
    name: p && p.name ? String(p.name) : `محصول ${index + 1}`,
    order: Number.isFinite(Number(p && p.order)) ? Number(p.order) : (index + 1),
    active: typeof (p && p.active) === 'boolean' ? p.active : true,
    originalPrice: p && p.originalPrice !== undefined ? String(p.originalPrice) : String(p && p.price !== undefined ? p.price : ''),
    price: p && p.price !== undefined ? String(p.price) : '0',
    description: p && p.description ? String(p.description) : '',
    media: normalizeMediaArray(p && p.media ? p.media : p && p.photoId ? [{ type: 'photo', media: p.photoId }] : []),
    files: normalizeFilesArray(p && (p.files || p.fileIds || (p.fileId ? [p.fileId] : []))),
    bannerMedia: normalizeMediaArray(p && p.bannerMedia ? p.bannerMedia : []),
    deletePending: false
  };
  if (p && typeof p.isCombo !== 'undefined') product.isCombo = Boolean(p.isCombo);
  return product;
}

let botData = createDefaultData();

if (fs.existsSync(DATA_PATH)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    botData = {
      ...createDefaultData(),
      ...loaded,
      settings: { ...createDefaultData().settings, ...(loaded.settings || {}) },
      stats: { ...createDefaultData().stats, ...(loaded.stats || {}) },
      buttonStats: { ...createDefaultData().buttonStats, ...(loaded.buttonStats || {}) }
    };

    const productIds = Object.keys(botData.products || {});
    const normalizedProducts = {};
    productIds.forEach((id, index) => {
      normalizedProducts[id] = normalizeProduct(botData.products[id], index);
    });
    botData.products = normalizedProducts;

    if (!Array.isArray(botData.settings.productsMenuBannerMedia)) {
      botData.settings.productsMenuBannerMedia = [];
    }
    botData.settings.productsMenuBannerMedia = normalizeMediaArray(botData.settings.productsMenuBannerMedia);

    if (!botData.buttonStats.products) botData.buttonStats.products = {};
    Object.keys(botData.products).forEach(id => {
      if (!botData.buttonStats.products[id]) {
        botData.buttonStats.products[id] = { name: botData.products[id].name, clicks: 0 };
      } else {
        botData.buttonStats.products[id].name = botData.products[id].name;
        if (typeof botData.buttonStats.products[id].clicks !== 'number') botData.buttonStats.products[id].clicks = 0;
      }
    });

    if (!botData.stats.uniqueUsers) botData.stats.uniqueUsers = {};
    if (!botData.stats.daily) {
      botData.stats.daily = {
        date: getTehranDateInfo().dateStr,
        starts: 0,
        newUsers: 0,
        purchases: 0,
        reported: false
      };
    }
  } catch (e) {
    console.error('Error reading data.json, using defaults', e);
  }
}

function saveData() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(botData, null, 2), 'utf8');
}

function syncButtonStats() {
  if (!botData.buttonStats) botData.buttonStats = createDefaultData().buttonStats;
  if (!botData.buttonStats.products) botData.buttonStats.products = {};
  Object.keys(botData.products || {}).forEach(id => {
    if (!botData.buttonStats.products[id]) {
      botData.buttonStats.products[id] = { name: botData.products[id].name, clicks: 0 };
    } else {
      botData.buttonStats.products[id].name = botData.products[id].name;
      if (typeof botData.buttonStats.products[id].clicks !== 'number') botData.buttonStats.products[id].clicks = 0;
    }
  });
}

function trackButtonClick(key, pId = null) {
  if (pId) {
    if (!botData.buttonStats.products[pId]) {
      botData.buttonStats.products[pId] = { name: botData.products[pId] ? botData.products[pId].name : 'نامشخص', clicks: 0 };
    }
    botData.buttonStats.products[pId].clicks += 1;
    if (botData.products[pId]) botData.buttonStats.products[pId].name = botData.products[pId].name;
  } else if (key && typeof botData.buttonStats[key] !== 'undefined') {
    botData.buttonStats[key] += 1;
  }
  saveData();
}

function getAdminReportText(title) {
  const daily = botData.stats.daily;
  const totalStarts = botData.stats.totalStarts || 0;
  const convRate = daily.starts > 0 ? ((daily.purchases / daily.starts) * 100).toFixed(1) : '0.0';
  return `📊 <b>${title}</b>\n\n` +
    `استارت امروز: ${daily.starts}\n` +
    `مجموع استارت ها: ${totalStarts}\n` +
    `کاربران جدید: ${daily.newUsers}\n` +
    `خریدها: ${daily.purchases}\n` +
    `نرخ تبدیل: ${convRate}%`;
}

function getButtonStatsText() {
  const bs = botData.buttonStats;
  const totalPurchases = botData.stats.totalPurchases || 0;
  const dailyStarts = botData.stats.daily.starts || 0;
  const totalStarts = botData.stats.totalStarts || 0;
  let text = `📈 <b>آمار کلیک دکمه‌ها</b>\n`;
  text += `━━━━━━━━━━━━━━━━\n\n`;
  text += `▶️ استارت امروز: <b>${dailyStarts}</b>\n`;
  text += `▶️ کل استارت‌ها: <b>${totalStarts}</b>\n\n`;
  text += `🛒 منوی محصولات: <b>${bs.user_products || 0}</b> بار\n`;
  text += `💡 راهنمای استفاده: <b>${bs.user_tutorials || 0}</b> بار\n`;
  text += `💬 پشتیبانی: <b>${bs.user_support || 0}</b> بار\n`;
  text += `\n━━━━━━━━━━━━━━━━\n`;

  const productIds = Object.keys(bs.products || {});
  if (productIds.length > 0) {
    text += `📦 <b>کلیک روی هر محصول:</b>\n\n`;
    productIds.forEach((pId, index) => {
      const pData = bs.products[pId];
      text += `  ${index + 1}. ${escapeHtml(pData.name)}\n     👆 <b>${pData.clicks}</b> بار کلیک\n\n`;
    });
  } else {
    text += `\n📦 هنوز محصولی ثبت نشده است.\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━\n`;
  text += `✅ کل خریدهای تایید شده: <b>${totalPurchases}</b>`;
  return text;
}

function getDiscountTimerString() {
  const now = new Date();
  const currentHour = now.getHours();
  const nextIntervalHour = Math.ceil((currentHour + 0.01) / 4) * 4 % 24;
  const nextReset = new Date(now);
  nextReset.setHours(nextIntervalHour === 0 ? 24 : nextIntervalHour, 0, 0, 0);
  const diffMs = nextReset - now;
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;
  return `${hours} ساعت و ${minutes} دقیقه`;
}

const adminStates = {};

const ADMIN_MAIN_MENU = {
  inline_keyboard: [
    [{ text: 'مدیریت محصولات', callback_data: 'adm_menu_products' }, { text: 'متون ربات', callback_data: 'adm_menu_texts' }],
    [{ text: 'آمار زنده', callback_data: 'adm_stats' }, { text: 'دیتای دکمه‌ها', callback_data: 'adm_data' }],
    [{ text: 'تنظیمات کارت', callback_data: 'adm_menu_card' }, { text: 'بکاپ', callback_data: 'adm_backup' }],
    [{ text: 'بستن پنل', callback_data: 'adm_menu_close' }]
  ]
};

function getMainMenu(firstName) {
  const welcomeText = botData.settings.welcome.replace('{name}', firstName || 'کاربر');
  return {
    text: welcomeText,
    keyboard: {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'مشاهده و دریافت پلنرها', callback_data: 'user_products' }],
          [{ text: 'راهنمای استفاده', callback_data: 'user_tutorials' }, { text: 'پشتیبانی', callback_data: 'user_support' }]
        ]
      }
    }
  };
}

function getActiveProductsSorted() {
  return Object.entries(botData.products || {})
    .filter(([, p]) => p && p.active !== false)
    .sort((a, b) => {
      const ao = Number(a[1].order || 999999);
      const bo = Number(b[1].order || 999999);
      if (ao !== bo) return ao - bo;
      return String(a[1].name || '').localeCompare(String(b[1].name || ''), 'fa');
    });
}

function getAllProductsSorted() {
  return Object.entries(botData.products || {})
    .sort((a, b) => {
      const ao = Number(a[1].order || 999999);
      const bo = Number(b[1].order || 999999);
      if (ao !== bo) return ao - bo;
      return String(a[1].name || '').localeCompare(String(b[1].name || ''), 'fa');
    });
}

function buildActiveProductsKeyboard() {
  const products = getActiveProductsSorted();
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const row = [];
    const [id1, p1] = products[i];
    row.push({ text: `${p1.name} | ${formatPrice(p1.price)} تومان`, callback_data: `view_p_${id1}` });
    if (products[i + 1]) {
      const [id2, p2] = products[i + 1];
      row.push({ text: `${p2.name} | ${formatPrice(p2.price)} تومان`, callback_data: `view_p_${id2}` });
    }
    rows.push(row);
  }
  rows.push([{ text: 'بازگشت به منوی اصلی', callback_data: 'back_to_main' }]);
  return rows;
}

function sendMediaItems(chatId, mediaItems) {
  const media = normalizeMediaArray(mediaItems);
  if (!media.length) return Promise.resolve();

  if (media.length === 1) {
    const m = media[0];
    if (m.type === 'photo') return bot.sendPhoto(chatId, m.media).then(() => {});
    return bot.sendVideo(chatId, m.media).then(() => {});
  }

  const group = media.slice(0, 10).map((m, index) => ({
    type: m.type,
    media: m.media,
    caption: index === 0 ? undefined : undefined
  }));

  return bot.sendMediaGroup(chatId, group).then(() => {}).catch(() => {});
}

function sendProductDetails(chatId, product) {
  const formattedOriginal = formatPrice(product.originalPrice || product.price);
  const formattedDiscount = formatPrice(product.price);
  const timerText = getDiscountTimerString();
  const infoText = `<b>${escapeHtml(product.name)}</b>\n\n${product.description || ''}\n\n❌ قیمت اصلی: <s>${escapeHtml(formattedOriginal)} تومان</s>\n🔥 <b>قیمت ویژه:</b> ${escapeHtml(formattedDiscount)} تومان\n\n⏳ <b>تخفیف:</b> <code>${timerText}</code>\n\n🏦 <b>شماره کارت:</b> <code>${escapeHtml(botData.settings.cardNo)}</code>\n👤 <b>به نام:</b> ${escapeHtml(botData.settings.cardName)}\n\nپس از واریز، <b>رسید پرداخت</b> را همین‌جا ارسال کنید.`;

  const topMedia = normalizeMediaArray(product.bannerMedia);
  const productMedia = normalizeMediaArray(product.media);

  if (topMedia.length) {
    sendMediaItems(chatId, topMedia).catch(() => {});
  }

  if (productMedia.length === 1) {
    const m = productMedia[0];
    if (m.type === 'photo') return bot.sendPhoto(chatId, m.media, { caption: infoText, parse_mode: 'HTML' }).catch(() => bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' }));
    return bot.sendVideo(chatId, m.media, { caption: infoText, parse_mode: 'HTML' }).catch(() => bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' }));
  }

  if (productMedia.length > 1) {
    const group = productMedia.slice(0, 10).map((m, index) => ({
      type: m.type,
      media: m.media,
      caption: index === 0 ? infoText : undefined,
      parse_mode: 'HTML'
    }));
    return bot.sendMediaGroup(chatId, group).catch(() => bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' }));
  }

  return bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
}

function sendProductFilesToUser(chatId, product) {
  const files = Array.isArray(product.files) ? product.files : [];
  if (files.length === 0) {
    bot.sendMessage(chatId, '⚠️ فایل این محصول توسط ادمین آپلود نشده است. با پشتیبانی در ارتباط باشید.').catch(() => {});
    return;
  }

  files.forEach((fId, index) => {
    bot.sendDocument(chatId, fId, { caption: `فایل محصول (${index + 1} از ${files.length}): ${product.name}` }).catch(() => {});
  });
}

function sendApprovedProductFlow(chatId, pId) {
  const product = botData.products[pId];
  if (!product) {
    bot.sendMessage(chatId, '⚠️ محصول مورد نظر پیدا نشد.').catch(() => {});
    return;
  }

  bot.sendMessage(chatId, botData.settings.approved, { parse_mode: 'HTML' }).catch(() => {});
  sendProductFilesToUser(chatId, product);
}

function buildReceiptAdminKeyboard(targetUserId) {
  const rows = [];
  const activeProducts = getActiveProductsSorted();
  activeProducts.forEach(([pId, p]) => {
    rows.push([
      { text: `ارسال ${p.name}`, callback_data: `approve_${targetUserId}_${pId}` }
    ]);
  });

  rows.push([
    { text: 'رد تراکنش', callback_data: `reject_${targetUserId}_none` },
    { text: 'ارسال پلنرهای دیگر', callback_data: `more_products_${targetUserId}` }
  ]);

  return { inline_keyboard: rows };
}

function buildMoreProductsKeyboard(targetUserId) {
  const rows = [];
  const activeProducts = getActiveProductsSorted();
  activeProducts.forEach(([pId, p]) => {
    rows.push([{ text: p.name, callback_data: `approve_${targetUserId}_${pId}` }]);
  });
  rows.push([{ text: 'بازگشت', callback_data: `receipt_back_${targetUserId}` }]);
  return { inline_keyboard: rows };
}

function showAdminProductsMenu(chatId, msgId = null) {
  const products = getAllProductsSorted();
  const rows = [];
  products.forEach(([pId, p]) => {
    rows.push([
      { text: p.name, callback_data: `adm_editmenu_${pId}` },
      { text: 'حذف', callback_data: `adm_delask_${pId}` }
    ]);
  });

  rows.push([{ text: 'افزودن محصول', callback_data: 'adm_add_product' }]);
  rows.push([{ text: 'بازگشت به منوی ادمین', callback_data: 'adm_back_main' }]);

  const text = '📦 <b>مدیریت محصولات</b>\nمحصول مورد نظر را انتخاب کنید:';
  const options = { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } };

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
      [{ text: 'نام', callback_data: `editp_name_${pId}` }, { text: 'ترتیب', callback_data: `editp_order_${pId}` }],
      [{ text: 'قیمت اصلی', callback_data: `editp_origprice_${pId}` }, { text: 'قیمت نهایی', callback_data: `editp_price_${pId}` }],
      [{ text: p.active ? 'غیرفعال کردن' : 'فعال کردن', callback_data: `editp_toggle_${pId}` }, { text: 'توضیحات', callback_data: `editp_desc_${pId}` }],
      [{ text: `عکس/ویدیو بالا (${p.bannerMedia.length})`, callback_data: `editp_banner_${pId}` }, { text: 'پاکسازی', callback_data: `editp_clearbanner_${pId}` }],
      [{ text: `رسانه محصول (${p.media.length})`, callback_data: `editp_addmedia_${pId}` }, { text: 'پاکسازی', callback_data: `editp_clearmedia_${pId}` }],
      [{ text: `فایل‌ها (${p.files.length})`, callback_data: `editp_addfile_${pId}` }, { text: 'پاکسازی', callback_data: `editp_clearfile_${pId}` }],
      [{ text: 'حذف محصول', callback_data: `adm_delask_${pId}` }],
      [{ text: 'بازگشت', callback_data: 'adm_menu_products' }]
    ]
  };

  const text = `🛠 <b>ویرایش محصول: ${escapeHtml(p.name)}</b>`;
  bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

function showAdminSettingsMenu(chatId, msgId) {
  const kb = {
    inline_keyboard: [
      [{ text: 'متن خوش‌آمدگویی', callback_data: 'set_text_welcome' }, { text: 'متن راهنما', callback_data: 'set_text_tutorials' }],
      [{ text: 'متن پشتیبانی', callback_data: 'set_text_support' }],
      [{ text: 'متن تایید پرداخت', callback_data: 'set_text_approved' }, { text: 'متن رد پرداخت', callback_data: 'set_text_rejected' }],
      [{ text: 'متن نبود محصول', callback_data: 'set_text_noProductsText' }, { text: 'متن لیست محصولات', callback_data: 'set_text_productsMenuTitle' }],
      [{ text: 'عکس/ویدیو بالای محصولات', callback_data: 'set_products_banner_add' }, { text: 'پاکسازی بنر محصولات', callback_data: 'set_products_banner_clear' }],
      [{ text: 'بازگشت', callback_data: 'adm_back_main' }]
    ]
  };

  bot.editMessageText('📝 <b>تنظیمات متون و بنرها</b>\nبخش مورد نظر را انتخاب کنید:', {
    chat_id: chatId,
    message_id: msgId,
    parse_mode: 'HTML',
    reply_markup: kb
  }).catch(() => {});
}

function resetAdminState(chatId) {
  delete adminStates[chatId];
}

function startProductCreation(chatId) {
  adminStates[chatId] = {
    type: 'ADD_PRODUCT_NAME',
    media: [],
    files: [],
    bannerMedia: []
  };
  bot.sendMessage(chatId, '🆕 نام محصول را بفرستید:');
}

function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(BACKUP_DIR, `backup_${stamp}`);
  fs.mkdirSync(targetDir, { recursive: true });

  const copied = [];
  PROJECT_FILES_TO_BACKUP.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      const base = path.basename(filePath);
      fs.copyFileSync(filePath, path.join(targetDir, base));
      copied.push(base);
    }
  });

  const meta = {
    createdAt: new Date().toISOString(),
    copiedFiles: copied
  };
  fs.writeFileSync(path.join(targetDir, 'backup-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return { targetDir, copied };
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const chatIdStr = String(chatId);
  botData.stats.totalStarts = (botData.stats.totalStarts || 0) + 1;
  botData.stats.daily.starts += 1;

  if (!botData.stats.uniqueUsers) botData.stats.uniqueUsers = {};
  if (!botData.stats.uniqueUsers[chatIdStr]) {
    botData.stats.uniqueUsers[chatIdStr] = true;
    botData.stats.daily.newUsers += 1;
  }
  saveData();

  const menu = getMainMenu(msg.from.first_name);
  bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', ...menu.keyboard }).catch(() => {});
});

bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== adminChatId) return;
  bot.sendMessage(chatId, '🛠 <b>پنل مدیریت</b>\nاز گزینه‌های زیر استفاده کنید:', {
    parse_mode: 'HTML',
    reply_markup: ADMIN_MAIN_MENU
  }).catch(() => {});
});

bot.onText(/\/data/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== adminChatId) return;
  bot.sendMessage(chatId, getButtonStatsText(), { parse_mode: 'HTML' }).catch(() => {});
});

setInterval(() => {
  const { dateStr, timeStr } = getTehranDateInfo();

  if (timeStr === '23:59' && !botData.stats.daily.reported) {
    const reportMsg = getAdminReportText('گزارش امروز');
    bot.sendMessage(adminChatId, reportMsg, { parse_mode: 'HTML' }).catch(() => {});
    botData.stats.daily.reported = true;
    saveData();
  }

  if (dateStr !== botData.stats.daily.date) {
    botData.stats.daily = { date: dateStr, starts: 0, newUsers: 0, purchases: 0, reported: false };
    saveData();
  }
}, 60000);

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (text && text.startsWith('/')) return;

  if (String(chatId) !== adminChatId) {
    handleUserReceipt(msg);
    return;
  }

  if (adminStates[chatId]) handleAdminWorkflow(msg);
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const msgId = query.message.message_id;

  bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'user_products') {
    trackButtonClick('user_products');
    const activeProducts = getActiveProductsSorted();

    if (activeProducts.length === 0) {
      bot.sendMessage(chatId, botData.settings.noProductsText, { parse_mode: 'HTML' }).catch(() => {});
      return;
    }

    const bannerMedia = normalizeMediaArray(botData.settings.productsMenuBannerMedia);
    if (bannerMedia.length) {
      sendMediaItems(chatId, bannerMedia).catch(() => {});
    }

    bot.editMessageText(botData.settings.productsMenuTitle, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buildActiveProductsKeyboard() }
    }).catch(() => {
      bot.sendMessage(chatId, botData.settings.productsMenuTitle, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buildActiveProductsKeyboard() }
      }).catch(() => {});
    });
    return;
  }

  if (data === 'back_to_main') {
    const menu = getMainMenu(query.from.first_name);
    bot.editMessageText(menu.text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: menu.keyboard.reply_markup
    }).catch(() => {});
    return;
  }

  if (data === 'user_tutorials') {
    trackButtonClick('user_tutorials');
    bot.sendMessage(chatId, botData.settings.tutorials, { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  if (data === 'user_support') {
    trackButtonClick('user_support');
    bot.sendMessage(chatId, botData.settings.support, { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  if (data.startsWith('view_p_')) {
    const pId = data.replace('view_p_', '');
    const product = botData.products[pId];
    if (!product || product.active === false) return;
    trackButtonClick(null, pId);
    sendProductDetails(chatId, product);
    return;
  }

  if (String(chatId) !== adminChatId) return;

  if (data === 'adm_menu_close') {
    bot.deleteMessage(chatId, msgId).catch(() => {});
    return;
  }

  if (data === 'adm_back_main') {
    bot.editMessageText('🛠 <b>پنل مدیریت</b>\nاز گزینه‌های زیر استفاده کنید:', {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: ADMIN_MAIN_MENU
    }).catch(() => {});
    return;
  }

  if (data === 'adm_stats') {
    const kb = {
      inline_keyboard: [
        [{ text: 'به‌روزرسانی', callback_data: 'adm_stats' }],
        [{ text: 'بازگشت', callback_data: 'adm_back_main' }]
      ]
    };
    bot.editMessageText(getAdminReportText('آمار زنده (امروز)'), {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: kb
    }).catch(() => {});
    return;
  }

  if (data === 'adm_data') {
    const kb = {
      inline_keyboard: [
        [{ text: 'به‌روزرسانی', callback_data: 'adm_data' }],
        [{ text: 'بازگشت', callback_data: 'adm_back_main' }]
      ]
    };
    bot.editMessageText(getButtonStatsText(), {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: kb
    }).catch(() => {});
    return;
  }

  if (data === 'adm_menu_products') {
    showAdminProductsMenu(chatId, msgId);
    return;
  }

  if (data === 'adm_menu_texts') {
    showAdminSettingsMenu(chatId, msgId);
    return;
  }

  if (data === 'adm_menu_card') {
    adminStates[chatId] = { type: 'EDIT_CARD_NO' };
    bot.sendMessage(chatId, `💳 شماره کارت فعلی: <code>${escapeHtml(botData.settings.cardNo)}</code>\n\nشماره کارت جدید را بفرستید:`, { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  if (data === 'adm_backup') {
    try {
      const result = createBackup();
      bot.sendMessage(chatId, `✅ بکاپ ساخته شد.\n\nپوشه: <code>${escapeHtml(result.targetDir)}</code>\nفایل‌ها: <code>${escapeHtml(result.copied.join(', ') || 'هیچ')}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    } catch (e) {
      bot.sendMessage(chatId, `❌ بکاپ ناموفق بود:\n<code>${escapeHtml(e.message)}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    }
    return;
  }

  if (data.startsWith('adm_delask_')) {
    const pId = data.replace('adm_delask_', '');
    const p = botData.products[pId];
    if (!p) return;
    bot.editMessageText(`حذف محصول «${escapeHtml(p.name)}» را تایید می‌کنی؟`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'بله، حذف شود', callback_data: `adm_del_${pId}` }],
          [{ text: 'خیر', callback_data: `adm_editmenu_${pId}` }]
        ]
      }
    }).catch(() => {});
    return;
  }

  if (data.startsWith('adm_del_')) {
    const pId = data.replace('adm_del_', '');
    if (botData.products[pId]) delete botData.products[pId];
    if (botData.buttonStats.products[pId]) delete botData.buttonStats.products[pId];
    saveData();
    bot.answerCallbackQuery(query.id, { text: '✅ محصول حذف شد.', show_alert: true }).catch(() => {});
    showAdminProductsMenu(chatId, msgId);
    return;
  }

  if (data === 'adm_add_product') {
    startProductCreation(chatId);
    return;
  }

  if (data.startsWith('adm_editmenu_')) {
    const pId = data.replace('adm_editmenu_', '');
    showEditProductMenu(chatId, pId, msgId);
    return;
  }

  if (data.startsWith('editp_')) {
    const parts = data.split('_');
    const action = parts[1];
    const pId = parts.slice(2).join('_');
    const p = botData.products[pId];
    if (!p) return;

    if (action === 'toggle') {
      p.active = !p.active;
      saveData();
      bot.answerCallbackQuery(query.id, { text: p.active ? 'فعال شد' : 'غیرفعال شد', show_alert: true }).catch(() => {});
      showEditProductMenu(chatId, pId, msgId);
      return;
    }

    if (action === 'clearbanner') {
      p.bannerMedia = [];
      saveData();
      bot.answerCallbackQuery(query.id, { text: 'پاک شد', show_alert: true }).catch(() => {});
      showEditProductMenu(chatId, pId, msgId);
      return;
    }

    if (action === 'clearmedia') {
      p.media = [];
      saveData();
      bot.answerCallbackQuery(query.id, { text: 'پاک شد', show_alert: true }).catch(() => {});
      showEditProductMenu(chatId, pId, msgId);
      return;
    }

    if (action === 'clearfile') {
      p.files = [];
      saveData();
      bot.answerCallbackQuery(query.id, { text: 'پاک شد', show_alert: true }).catch(() => {});
      showEditProductMenu(chatId, pId, msgId);
      return;
    }

    adminStates[chatId] = { type: 'EDIT_FIELD', field: action, pId, collecting: false };
    const prompts = {
      name: 'نام جدید را ارسال کنید:',
      order: 'ترتیب نمایش را ارسال کنید. عدد کمتر بالاتر نمایش داده می‌شود:',
      origprice: 'قیمت اصلی جدید را ارسال کنید:',
      price: 'قیمت نهایی جدید را ارسال کنید:',
      desc: 'توضیحات جدید را ارسال کنید:',
      banner: 'عکس یا ویدیوی بالای محصولات را ارسال کنید. هرچقدر خواستید می‌توانید بفرستید. برای اتمام، یک پیام متنی معمولی بفرستید یا از دکمه بازگشت استفاده کنید.',
      addmedia: 'عکس یا ویدیوی محصول را ارسال کنید. هرچقدر خواستید می‌توانید بفرستید.',
      addfile: 'فایل محصول را ارسال کنید. هرچقدر خواستید می‌توانید بفرستید.'
    };
    bot.sendMessage(chatId, prompts[action] || 'مقدار جدید را ارسال کنید:').catch(() => {});
    return;
  }

  if (data === 'set_products_banner_add') {
    adminStates[chatId] = { type: 'EDIT_PRODUCTS_BANNER' };
    bot.sendMessage(chatId, 'عکس یا ویدیوی بالای منوی محصولات را ارسال کنید.').catch(() => {});
    return;
  }

  if (data === 'set_products_banner_clear') {
    botData.settings.productsMenuBannerMedia = [];
    saveData();
    bot.answerCallbackQuery(query.id, { text: 'پاک شد', show_alert: true }).catch(() => {});
    showAdminSettingsMenu(chatId, msgId);
    return;
  }

  if (data.startsWith('set_text_')) {
    const key = data.replace('set_text_', '');
    adminStates[chatId] = { type: 'EDIT_SETTING_TEXT', key };
    bot.sendMessage(chatId, `متن جدید را ارسال کنید:\n\nمتن فعلی:\n${botData.settings[key] || ''}`).catch(() => {});
    return;
  }

  if (data.startsWith('more_products_')) {
    const targetUserId = data.replace('more_products_', '');
    bot.editMessageText('یکی از پلنرهای دیگر را انتخاب کنید:', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: buildMoreProductsKeyboard(targetUserId)
    }).catch(() => {});
    return;
  }

  if (data.startsWith('receipt_back_')) {
    const targetUserId = data.replace('receipt_back_', '');
    bot.editMessageText('یکی از گزینه‌های زیر را انتخاب کنید:', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: buildReceiptAdminKeyboard(targetUserId)
    }).catch(() => {});
    return;
  }

  if (data.startsWith('approve_')) {
    const parts = data.split('_');
    const targetUserId = parts[1];
    const pId = parts.slice(2).join('_');
    const product = botData.products[pId];
    if (!product) return;

    botData.stats.totalPurchases = (botData.stats.totalPurchases || 0) + 1;
    botData.stats.daily.purchases += 1;
    saveData();

    sendApprovedProductFlow(targetUserId, pId);

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: adminChatId, message_id: msgId }).catch(() => {});
    bot.sendMessage(adminChatId, `✅ تراکنش برای «${escapeHtml(product.name)}» تایید شد.`, { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  if (data.startsWith('reject_')) {
    const targetUserId = data.split('_')[1];
    bot.sendMessage(targetUserId, botData.settings.rejected, { parse_mode: 'HTML' }).catch(() => {});
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: adminChatId, message_id: msgId }).catch(() => {});
    bot.sendMessage(adminChatId, '❌ تراکنش رد شد.', { parse_mode: 'HTML' }).catch(() => {});
    return;
  }
});

function handleAdminWorkflow(msg) {
  const chatId = msg.chat.id;
  const state = adminStates[chatId];
  const text = msg.text;

  if (!state) return;

  if (state.type === 'ADD_PRODUCT_NAME') {
    state.name = text;
    state.type = 'ADD_PRODUCT_ORDER';
    bot.sendMessage(chatId, 'ترتیب نمایش را بفرستید:').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_ORDER') {
    state.order = parseNumeric(text, 999999);
    state.type = 'ADD_PRODUCT_ORIGINAL_PRICE';
    bot.sendMessage(chatId, 'قیمت اصلی را بفرستید:').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_ORIGINAL_PRICE') {
    state.originalPrice = text;
    state.type = 'ADD_PRODUCT_PRICE';
    bot.sendMessage(chatId, 'قیمت نهایی را بفرستید:').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_PRICE') {
    state.price = text;
    state.type = 'ADD_PRODUCT_DESC';
    bot.sendMessage(chatId, 'توضیحات محصول را بفرستید:').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_DESC') {
    state.description = text;
    state.type = 'ADD_PRODUCT_BANNER';
    bot.sendMessage(chatId, 'اگر می‌خواهی عکس/ویدیو بالای محصول باشد، الان بفرست. اگر نمی‌خواهی، کلمه `skip` بفرست.').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_BANNER') {
    if (String(text).trim().toLowerCase() === 'skip') {
      state.type = 'ADD_PRODUCT_MEDIA';
      bot.sendMessage(chatId, 'حالا عکس/ویدیوهای محصول را بفرست.').catch(() => {});
      return;
    }
    bot.sendMessage(chatId, 'فقط عکس یا ویدیو بفرست یا `skip` کن.').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_MEDIA') {
    if (msg.photo) {
      state.media.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
      bot.sendMessage(chatId, 'رسانه دریافت شد. فایل بعدی را بفرست یا متن `done` بفرست تا برویم مرحله فایل‌ها.').catch(() => {});
      return;
    }
    if (msg.video) {
      state.media.push({ type: 'video', media: msg.video.file_id });
      bot.sendMessage(chatId, 'رسانه دریافت شد. فایل بعدی را بفرست یا متن `done` بفرست تا برویم مرحله فایل‌ها.').catch(() => {});
      return;
    }
    if (String(text).trim().toLowerCase() === 'done') {
      state.type = 'ADD_PRODUCT_FILE';
      bot.sendMessage(chatId, 'حالا فایل‌های محصول را بفرست.').catch(() => {});
      return;
    }
    bot.sendMessage(chatId, 'فقط عکس، ویدیو، یا `done` بفرست.').catch(() => {});
    return;
  }

  if (state.type === 'ADD_PRODUCT_FILE') {
    if (msg.document) {
      state.files.push(msg.document.file_id);
      bot.sendMessage(chatId, 'فایل دریافت شد. فایل بعدی را بفرست یا متن `done` بفرست تا ذخیره شود.').catch(() => {});
      return;
    }
    if (String(text).trim().toLowerCase() === 'done') {
      const newId = `p_${Date.now()}`;
      botData.products[newId] = normalizeProduct({
        name: state.name,
        order: state.order,
        active: true,
        originalPrice: state.originalPrice,
        price: state.price,
        description: state.description,
        media: state.media,
        files: state.files,
        bannerMedia: state.bannerMedia || []
      });
      botData.buttonStats.products[newId] = { name: state.name, clicks: 0 };
      saveData();
      resetAdminState(chatId);
      bot.sendMessage(chatId, '✅ محصول ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
      return;
    }
    bot.sendMessage(chatId, 'فقط فایل یا `done` بفرست.').catch(() => {});
    return;
  }

  if (state.type === 'EDIT_FIELD') {
    const p = botData.products[state.pId];
    if (!p) {
      resetAdminState(chatId);
      return;
    }

    if (state.collecting === true) {
      if (state.field === 'banner') {
        if (msg.photo) p.bannerMedia.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
        else if (msg.video) p.bannerMedia.push({ type: 'video', media: msg.video.file_id });
        else if (String(text).trim().toLowerCase() === 'done') {
          saveData();
          resetAdminState(chatId);
          bot.sendMessage(chatId, '✅ ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
          return;
        } else {
          bot.sendMessage(chatId, 'فقط عکس، ویدیو، یا `done` بفرست.').catch(() => {});
          return;
        }
        saveData();
        bot.sendMessage(chatId, '✅ اضافه شد. ادامه بده یا `done` بفرست.').catch(() => {});
        return;
      }

      if (state.field === 'addmedia') {
        if (msg.photo) p.media.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
        else if (msg.video) p.media.push({ type: 'video', media: msg.video.file_id });
        else if (String(text).trim().toLowerCase() === 'done') {
          saveData();
          resetAdminState(chatId);
          bot.sendMessage(chatId, '✅ ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
          return;
        } else {
          bot.sendMessage(chatId, 'فقط عکس، ویدیو، یا `done` بفرست.').catch(() => {});
          return;
        }
        saveData();
        bot.sendMessage(chatId, '✅ اضافه شد. ادامه بده یا `done` بفرست.').catch(() => {});
        return;
      }

      if (state.field === 'addfile') {
        if (msg.document) p.files.push(msg.document.file_id);
        else if (String(text).trim().toLowerCase() === 'done') {
          saveData();
          resetAdminState(chatId);
          bot.sendMessage(chatId, '✅ ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
          return;
        } else {
          bot.sendMessage(chatId, 'فقط فایل یا `done` بفرست.').catch(() => {});
          return;
        }
        saveData();
        bot.sendMessage(chatId, '✅ اضافه شد. ادامه بده یا `done` بفرست.').catch(() => {});
        return;
      }
    }

    if (state.field === 'name') {
      p.name = text;
      if (botData.buttonStats.products[state.pId]) botData.buttonStats.products[state.pId].name = text;
    } else if (state.field === 'order') {
      p.order = parseNumeric(text, p.order || 999999);
    } else if (state.field === 'origprice') {
      p.originalPrice = text;
    } else if (state.field === 'price') {
      p.price = text;
    } else if (state.field === 'desc') {
      p.description = text;
    } else if (state.field === 'banner') {
      state.collecting = true;
      if (msg.photo) p.bannerMedia.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
      else if (msg.video) p.bannerMedia.push({ type: 'video', media: msg.video.file_id });
      else {
        bot.sendMessage(chatId, 'فقط عکس یا ویدیو بفرست یا متن `done` بفرست.').catch(() => {});
        return;
      }
      saveData();
      bot.sendMessage(chatId, '✅ اضافه شد. ادامه بده یا `done` بفرست.').catch(() => {});
      return;
    } else if (state.field === 'addmedia') {
      state.collecting = true;
      if (msg.photo) p.media.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
      else if (msg.video) p.media.push({ type: 'video', media: msg.video.file_id });
      else {
        bot.sendMessage(chatId, 'فقط عکس یا ویدیو بفرست یا متن `done` بفرست.').catch(() => {});
        return;
      }
      saveData();
      bot.sendMessage(chatId, '✅ اضافه شد. ادامه بده یا `done` بفرست.').catch(() => {});
      return;
    } else if (state.field === 'addfile') {
      state.collecting = true;
      if (msg.document) p.files.push(msg.document.file_id);
      else {
        bot.sendMessage(chatId, 'فقط فایل بفرست یا متن `done` بفرست.').catch(() => {});
        return;
      }
      saveData();
      bot.sendMessage(chatId, '✅ اضافه شد. ادامه بده یا `done` بفرست.').catch(() => {});
      return;
    }

    saveData();
    resetAdminState(chatId);
    bot.sendMessage(chatId, '✅ تغییرات ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
    return;
  }

  if (state.type === 'EDIT_SETTING_TEXT') {
    botData.settings[state.key] = text;
    saveData();
    resetAdminState(chatId);
    bot.sendMessage(chatId, '✅ متن ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
    return;
  }

  if (state.type === 'EDIT_CARD_NO') {
    adminStates[chatId] = { type: 'EDIT_CARD_NAME', cardNo: text };
    bot.sendMessage(chatId, 'نام صاحب حساب را ارسال کنید:').catch(() => {});
    return;
  }

  if (state.type === 'EDIT_CARD_NAME') {
    botData.settings.cardNo = state.cardNo;
    botData.settings.cardName = text;
    saveData();
    resetAdminState(chatId);
    bot.sendMessage(chatId, '✅ اطلاعات کارت ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
    return;
  }

  if (state.type === 'EDIT_PRODUCTS_BANNER') {
    if (msg.photo) {
      botData.settings.productsMenuBannerMedia.push({ type: 'photo', media: msg.photo[msg.photo.length - 1].file_id });
      saveData();
      bot.sendMessage(chatId, '✅ اضافه شد. عکس/ویدیوی بعدی را بفرست یا اگر تمام شد، متن `done` بفرست.').catch(() => {});
      return;
    }
    if (msg.video) {
      botData.settings.productsMenuBannerMedia.push({ type: 'video', media: msg.video.file_id });
      saveData();
      bot.sendMessage(chatId, '✅ اضافه شد. عکس/ویدیوی بعدی را بفرست یا اگر تمام شد، متن `done` بفرست.').catch(() => {});
      return;
    }
    if (String(text).trim().toLowerCase() === 'done') {
      resetAdminState(chatId);
      bot.sendMessage(chatId, '✅ بنر منوی محصولات ذخیره شد.', { reply_markup: ADMIN_MAIN_MENU }).catch(() => {});
      return;
    }
    bot.sendMessage(chatId, 'فقط عکس یا ویدیو بفرست یا `done` کن.').catch(() => {});
    return;
  }
}

function handleUserReceipt(msg) {
  const chatId = msg.chat.id;
  const userText = msg.text;
  const username = msg.from.username ? `@${msg.from.username}` : 'بدون آیدی';
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  bot.sendMessage(chatId, '<b>✅ رسید شما دریافت شد!</b>\n\nبه محض تایید تراکنش، فایل‌ها برای شما ارسال می‌شوند.', { parse_mode: 'HTML' }).catch(() => {});

  const baseReportText = `🔔 <b>رسید یا پیام پرداخت جدید!</b>\n\n👤 <b>کاربر:</b> ${escapeHtml(fullName)} (${escapeHtml(username)})\n🆔 <b>شناسه کاربر:</b> <code>${chatId}</code>`;
  const textDetails = userText ? `\n📝 <b>متن ارسال شده:</b>\n<code>${escapeHtml(userText)}</code>` : '\n📝 <b>نوع رسید:</b> رسانه / فایل';
  const adminReportText = baseReportText + textDetails + `\n\nیکی از گزینه‌های زیر را انتخاب کنید:`;

  const adminKeyboard = buildReceiptAdminKeyboard(String(chatId));

  if (msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    bot.sendPhoto(adminChatId, photoId, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard }).catch(() => {});
  } else if (msg.document) {
    bot.sendDocument(adminChatId, msg.document.file_id, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard }).catch(() => {});
  } else if (msg.video) {
    bot.sendVideo(adminChatId, msg.video.file_id, { caption: adminReportText, parse_mode: 'HTML', reply_markup: adminKeyboard }).catch(() => {});
  } else {
    bot.sendMessage(adminChatId, adminReportText, { parse_mode: 'HTML', reply_markup: adminKeyboard }).catch(() => {});
  }
}

bot.on('polling_error', (err) => console.warn(`[Polling Error]: ${err.message}`));
bot.on('error', (err) => console.error(`[Bot Error]: ${err.message}`));

console.log('🤖 ربات آماده به کار است...');
