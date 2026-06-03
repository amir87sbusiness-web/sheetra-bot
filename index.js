'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ─── Env Validation ────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('❌ BOT_TOKEN و ADMIN_CHAT_ID تعریف نشده‌اند. ربات اجرا نمی‌شود.');
  process.exit(1);
}

// ─── Data Layer ─────────────────────────────────────────────────────────────
const DATA_PATH = '/app/data/data.json';
const DATA_DIR = path.dirname(DATA_PATH);
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_DATA = {
  texts: {
    welcome: '👋 خوش آمدید!\n\nاز گزینه‌های زیر انتخاب کنید.',
    guide: '📖 راهنمای خرید:\n\n۱. محصول مورد نظر را انتخاب کنید\n۲. مبلغ را به شماره کارت واریز کنید\n۳. تصویر رسید را ارسال کنید\n۴. پس از تایید، فایل برایتان ارسال می‌شود.',
    support: '📞 پشتیبانی:\n\nبرای ارتباط با ما پیام بدید.',
    paymentConfirm: '✅ پرداخت تایید شد. فایل‌هاتون ارسال شد، ممنون از خریدتون 🙏',
    paymentReject: '❌ متأسفانه پرداخت تایید نشد. لطفاً با پشتیبانی تماس بگیرید.',
    noProduct: '⚠️ فعلاً محصولی موجود نیست. بعداً سر بزنید!',
    sendReceipt: '📤 تصویر رسید پرداختتون رو اینجا بفرستید.',
    productsHeader: '🛍 محصولات ما',
  },
  card: {
    number: '6037-XXXX-XXXX-XXXX',
    owner: 'نام صاحب حساب',
  },
  products: [],
  headerMedia: [],
  productsPageMedia: [],
  stats: {
    starts: 0,
    uniqueUsers: [],
    confirmedSales: 0,
    dailyStats: {},
    productClicks: {},
    productSales: {},
  },
  buyers: [],
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function loadData() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_DATA)), parsed);
  } catch (e) {
    console.error('Error loading data:', e);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveData(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

function resetAllData() {
  try {
    ensureDataDir();
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    fs.writeFileSync(DATA_PATH, JSON.stringify(fresh, null, 2));
    return true;
  } catch (e) {
    console.error('Error resetting data:', e);
    return false;
  }
}

// ─── Bot Init ───────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ─── State Management ───────────────────────────────────────────────────────
const adminStates = {};
const userLastProduct = {};
const userPendingReceipt = {};

function setAdminState(chatId, state) { adminStates[chatId] = state; }
function getAdminState(chatId) { return adminStates[chatId] || null; }
function clearAdminState(chatId) { delete adminStates[chatId]; }

// ─── Helpers ────────────────────────────────────────────────────────────────
function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_CHAT_ID);
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function formatPrice(n) {
  if (n === undefined || n === null || n === '') return '—';
  return Number(n).toLocaleString('fa-IR') + ' تومان';
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function formatCardNumber(value = '') {
  const digits = normalizeDigits(value);
  if (digits.length !== 16) return value;
  return digits.replace(/(\d{4})(?=\d)/g, '$1-');
}

function sortedProducts(products) {
  return [...products].sort((a, b) => (a.order || 0) - (b.order || 0));
}

function activeProducts(products) {
  return sortedProducts(products).filter(p => p.active);
}

function getDiscountTimer() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;

  const totalSecs = Math.floor(diff / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours} ساعت و ${mins} دقیقه`;
  } else if (mins > 0) {
    return `${mins} دقیقه و ${secs} ثانیه`;
  } else {
    return `${secs} ثانیه`;
  }
}

function isVisualMedia(m) {
  return m && (m.type === 'photo' || m.type === 'video');
}

async function sendVisualMediaGroup(chatId, mediaItems, caption = '') {
  const visuals = (mediaItems || []).filter(isVisualMedia);
  if (visuals.length === 0) return false;

  for (let i = 0; i < visuals.length; i += 10) {
    const chunk = visuals.slice(i, i + 10).map((m, idx) => ({
      type: m.type,
      media: m.fileId,
      ...(i === 0 && idx === 0 && caption ? { caption, parse_mode: 'HTML' } : {}),
    }));
    await bot.sendMediaGroup(chatId, chunk);
  }

  return true;
}

async function sendNonVisualMedia(chatId, mediaItems) {
  for (const m of (mediaItems || [])) {
    try {
      if (!m || isVisualMedia(m)) continue;
      if (m.type === 'document') {
        await bot.sendDocument(chatId, m.fileId, {}, { filename: m.name || 'file' });
      } else {
        await bot.sendDocument(chatId, m.fileId, {}, { filename: m.name || 'file' });
      }
    } catch (e) {
      console.error('Send media error:', e.message);
    }
  }
}

// ─── Keyboards ───────────────────────────────────────────────────────────────
function mainQuickLinksKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🛍 محصولات', callback_data: 'quick_products' },
          { text: '📖 راهنما', callback_data: 'quick_guide' },
        ],
        [
          { text: '📞 پشتیبانی', callback_data: 'quick_support' },
        ],
      ],
    },
  };
}

function adminMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 مدیریت محصولات', callback_data: 'admin_products' }],
        [{ text: '✏️ متون ربات', callback_data: 'admin_texts' }],
        [{ text: '💳 تنظیمات کارت', callback_data: 'admin_card' }],
        [{ text: '🖼 هدر صفحه خوش‌آمد', callback_data: 'admin_header_media' }],
        [{ text: '🖼 مدیای صفحه محصولات', callback_data: 'admin_products_media' }],
        [{ text: '📊 آمار', callback_data: 'admin_stats' }],
        [{ text: '🛒 آمار خریداران', callback_data: 'admin_buyers' }],
        [{ text: '💾 بکاپ اطلاعات', callback_data: 'admin_backup' }],
        [{ text: '🗑 ریست کامل داده‌ها', callback_data: 'admin_reset_confirm' }],
      ],
    },
  };
}

function productsListKeyboard(products) {
  const active = activeProducts(products);
  if (active.length === 0) return null;

  const rows = active.map(p => [
    {
      text: p.emoji
        ? `${p.emoji} ${p.name} | ${formatPrice(p.price)}`
        : `${p.name} | ${formatPrice(p.price)}`,
      callback_data: `product_${p.id}`,
    },
  ]);

  rows.push([{ text: '🔙 بازگشت', callback_data: 'quick_back' }]);

  return { reply_markup: { inline_keyboard: rows } };
}

function adminProductsKeyboard(products) {
  const sorted = sortedProducts(products);
  const rows = sorted.map(p => [
    {
      text: `${p.active ? '✅' : '❌'} ${p.name} (#${p.order || 0})`,
      callback_data: `ap_view_${p.id}`,
    },
  ]);
  rows.push([{ text: '➕ افزودن محصول', callback_data: 'ap_add' }]);
  rows.push([{ text: '🔙 بازگشت', callback_data: 'admin_back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adminProductActionsKeyboard(productId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✏️ ویرایش نام', callback_data: `ape_name_${productId}` }],
        [{ text: '😀 ویرایش ایموجی', callback_data: `ape_emoji_${productId}` }],
        [{ text: '📝 ویرایش توضیحات', callback_data: `ape_desc_${productId}` }],
        [{ text: '💰 ویرایش قیمت‌ها', callback_data: `ape_prices_${productId}` }],
        [{ text: '🔢 ویرایش ترتیب', callback_data: `ape_order_${productId}` }],
        [{ text: '🖼 مدیریت مدیا', callback_data: `ape_media_${productId}` }],
        [{ text: '📁 مدیریت فایل‌ها', callback_data: `ape_files_${productId}` }],
        [{ text: '🔄 تغییر وضعیت', callback_data: `ape_toggle_${productId}` }],
        [{ text: '🗑 حذف محصول', callback_data: `ape_delete_${productId}` }],
        [{ text: '🔙 بازگشت', callback_data: 'admin_products' }],
      ],
    },
  };
}

function adminTextsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👋 متن خوش‌آمد', callback_data: 'atext_welcome' }],
        [{ text: '📖 متن راهنما', callback_data: 'atext_guide' }],
        [{ text: '📞 متن پشتیبانی', callback_data: 'atext_support' }],
        [{ text: '✅ متن تایید پرداخت', callback_data: 'atext_paymentConfirm' }],
        [{ text: '❌ متن رد پرداخت', callback_data: 'atext_paymentReject' }],
        [{ text: '⚠️ متن نبود محصول', callback_data: 'atext_noProduct' }],
        [{ text: '📤 متن درخواست رسید', callback_data: 'atext_sendReceipt' }],
        [{ text: '🛍 عنوان صفحه محصولات', callback_data: 'atext_productsHeader' }],
        [{ text: '🔙 بازگشت', callback_data: 'admin_back' }],
      ],
    },
  };
}

function receiptAdminKeyboard(userId, productId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ ارسال محصول انتخاب‌شده', callback_data: `receipt_send_${userId}_${productId}` }],
        [{ text: '📦 ارسال محصول دیگر', callback_data: `receipt_other_${userId}` }],
        [{ text: '❌ رد تراکنش', callback_data: `receipt_reject_${userId}` }],
      ],
    },
  };
}

function selectProductForUserKeyboard(products, userId) {
  const sorted = sortedProducts(products);
  const rows = sorted.map(p => [
    { text: p.name, callback_data: `sendother_${userId}_${p.id}` },
  ]);
  rows.push([{ text: '🔙 انصراف', callback_data: 'admin_back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function productActionKeyboard(cardNumber) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📤 ارسال رسید پرداخت', callback_data: 'send_receipt_active' }],
        [{ text: '📋 کپی شماره کارت', copy_text: { text: normalizeDigits(cardNumber) } }],
        [{ text: '🔙 بازگشت به محصولات', callback_data: 'quick_products' }],
      ],
    },
  };
}

// ─── Stat Helpers ───────────────────────────────────────────────────────────
function trackStart(data, userId) {
  data.stats.starts = (data.stats.starts || 0) + 1;
  if (!data.stats.uniqueUsers) data.stats.uniqueUsers = [];
  if (!data.stats.uniqueUsers.includes(String(userId))) {
    data.stats.uniqueUsers.push(String(userId));
  }
  const today = todayKey();
  if (!data.stats.dailyStats) data.stats.dailyStats = {};
  if (!data.stats.dailyStats[today]) data.stats.dailyStats[today] = { starts: 0, sales: 0 };
  data.stats.dailyStats[today].starts++;
}

function trackProductClick(data, productId) {
  if (!data.stats.productClicks) data.stats.productClicks = {};
  data.stats.productClicks[productId] = (data.stats.productClicks[productId] || 0) + 1;
}

function trackSale(data, userId, productId, username, firstName) {
  data.stats.confirmedSales = (data.stats.confirmedSales || 0) + 1;
  if (!data.stats.productSales) data.stats.productSales = {};
  data.stats.productSales[productId] = (data.stats.productSales[productId] || 0) + 1;

  const today = todayKey();
  if (!data.stats.dailyStats) data.stats.dailyStats = {};
  if (!data.stats.dailyStats[today]) data.stats.dailyStats[today] = { starts: 0, sales: 0 };
  data.stats.dailyStats[today].sales++;

  if (!data.buyers) data.buyers = [];
  data.buyers.push({
    userId: String(userId),
    username: username || '—',
    firstName: firstName || '—',
    productId: String(productId),
    date: new Date().toISOString(),
  });
}

// ─── Send Helpers ───────────────────────────────────────────────────────────
async function sendProductFiles(chatId, product) {
  for (const f of (product.files || [])) {
    try {
      if (f.type === 'photo') {
        await bot.sendPhoto(chatId, f.fileId);
      } else if (f.type === 'video') {
        await bot.sendVideo(chatId, f.fileId);
      } else {
        await bot.sendDocument(chatId, f.fileId, {}, { filename: f.name || 'file' });
      }
    } catch (e) {
      console.error('Send file error:', e.message);
    }
  }
}

async function finalizeAdminReceiptMessage(query, statusText) {
  if (!query || !query.message) return;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const originalText = query.message.text || '';
  const newText = `${originalText}\n\n${statusText}`;

  try {
    await bot.editMessageText(newText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (e) {
    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
    } catch (_) {}
  }
}

function buildProductCaption(product, data) {
  const desc = (product.description || '').trim();
  const shortDesc = desc.length > 700 ? `${desc.slice(0, 700)}…` : desc;

  const hasDiscount =
    Number(product.originalPrice) > 0 &&
    Number(product.price) > 0 &&
    Number(product.originalPrice) !== Number(product.price);

  let priceSection;
  if (hasDiscount) {
    priceSection =
      `💰 قیمت: <s>${escapeHtml(formatPrice(product.originalPrice))}</s>  <b>${escapeHtml(formatPrice(product.price))}</b>\n` +
      `⏳ تخفیف از بین میره: ${escapeHtml(getDiscountTimer())}`;
  } else {
    priceSection = `💰 قیمت: <b>${escapeHtml(formatPrice(product.price || product.originalPrice))}</b>`;
  }

  return (
    `📦 <b>${escapeHtml(product.name)}</b>\n\n` +
    `${escapeHtml(shortDesc || '—')}\n\n` +
    `${priceSection}\n\n` +
    `🏦 شماره کارت:\n` +
    `<code>${escapeHtml(formatCardNumber(data.card.number))}</code>\n` +
    `👤 به نام: ${escapeHtml(data.card.owner)}\n` +
    `👈 روی دکمه کپی شماره کارت بزنید تا شماره بدون خط تیره کپی شود.\n\n` +
    `پس از واریز، رسید پرداخت را همین‌جا ارسال کنید. ✨`
  );
}

async function sendProductPreview(chatId, product, data) {
  const caption = buildProductCaption(product, data);
  const visuals = (product.media || []).filter(isVisualMedia);
  const others = (product.media || []).filter(m => m && !isVisualMedia(m));

  const buttonKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📤 ارسال رسید پرداخت', callback_data: `send_receipt_${product.id}` }],
        [{ text: '📋 کپی شماره کارت', copy_text: { text: normalizeDigits(data.card.number) } }],
        [{ text: '🔙 بازگشت به محصولات', callback_data: 'quick_products' }],
      ],
    },
  };

  if (visuals.length === 0) {
    await bot.sendMessage(chatId, caption, {
      parse_mode: 'HTML',
      ...buttonKeyboard,
    });
    await sendNonVisualMedia(chatId, others);
    return;
  }

  if (visuals.length === 1) {
    const m = visuals[0];
    try {
      if (m.type === 'photo') {
        await bot.sendPhoto(chatId, m.fileId, {
          caption,
          parse_mode: 'HTML',
          ...buttonKeyboard,
        });
      } else if (m.type === 'video') {
        await bot.sendVideo(chatId, m.fileId, {
          caption,
          parse_mode: 'HTML',
          ...buttonKeyboard,
        });
      }
    } catch (e) {
      console.error('Send preview error:', e.message);
      await bot.sendMessage(chatId, caption, {
        parse_mode: 'HTML',
        ...buttonKeyboard,
      });
    }
    await sendNonVisualMedia(chatId, others);
    return;
  }

  await sendVisualMediaGroup(chatId, visuals, caption);
  await bot.sendMessage(chatId, 'برای دریافت فایل‌ها، از دکمه‌های زیر استفاده کنید.', {
    ...buttonKeyboard,
  });
  await sendNonVisualMedia(chatId, others);
}

// ─── User Flows ─────────────────────────────────────────────────────────────
async function handleStart(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const data = loadData();

  trackStart(data, userId);
  saveData(data);

  if (isAdmin(chatId)) {
    await bot.sendMessage(chatId, '👑 پنل مدیریت', adminMenuKeyboard());
    return;
  }

  const headerMedia = data.headerMedia || [];
  if (headerMedia.length === 0) {
    await bot.sendMessage(chatId, data.texts.welcome, mainQuickLinksKeyboard());
    return;
  }

  const visuals = headerMedia.filter(isVisualMedia);
  const others = headerMedia.filter(m => m && !isVisualMedia(m));

  if (visuals.length === 1) {
    const m = visuals[0];
    try {
      if (m.type === 'photo') {
        await bot.sendPhoto(chatId, m.fileId, {
          caption: data.texts.welcome,
          ...mainQuickLinksKeyboard(),
        });
      } else if (m.type === 'video') {
        await bot.sendVideo(chatId, m.fileId, {
          caption: data.texts.welcome,
          ...mainQuickLinksKeyboard(),
        });
      }
    } catch (e) {
      await bot.sendMessage(chatId, data.texts.welcome, mainQuickLinksKeyboard());
    }
  } else {
    if (visuals.length > 1) {
      await sendVisualMediaGroup(chatId, visuals, data.texts.welcome);
    }
    await bot.sendMessage(chatId, data.texts.welcome, mainQuickLinksKeyboard());
  }

  await sendNonVisualMedia(chatId, others);
}

async function handleProducts(chatId, data) {
  const keyboard = productsListKeyboard(data.products);
  const headerText = data.texts.productsHeader || '🛍 محصولات ما';

  if (!keyboard) {
    await bot.sendMessage(chatId, data.texts.noProduct, mainQuickLinksKeyboard());
    return;
  }

  const pageMedia = data.productsPageMedia || [];
  const visuals = pageMedia.filter(isVisualMedia);
  const others = pageMedia.filter(m => m && !isVisualMedia(m));

  if (visuals.length === 1) {
    const m = visuals[0];
    try {
      if (m.type === 'photo') {
        await bot.sendPhoto(chatId, m.fileId, {
          caption: headerText,
          ...keyboard,
        });
      } else if (m.type === 'video') {
        await bot.sendVideo(chatId, m.fileId, {
          caption: headerText,
          ...keyboard,
        });
      }
    } catch (e) {
      await bot.sendMessage(chatId, headerText, keyboard);
    }
  } else {
    if (visuals.length > 1) {
      await sendVisualMediaGroup(chatId, visuals, headerText);
    }
    await bot.sendMessage(chatId, headerText, keyboard);
  }

  await sendNonVisualMedia(chatId, others);
}

async function handleProductView(chatId, productId, userId) {
  const data = loadData();
  const product = data.products.find(p => String(p.id) === String(productId));

  if (!product || !product.active) {
    await bot.sendMessage(chatId, '❌ این محصول دیگر موجود نیست.');
    return;
  }

  userLastProduct[userId] = productId;
  trackProductClick(data, productId);
  saveData(data);

  await sendProductPreview(chatId, product, data);
}

// ─── Admin: Products ─────────────────────────────────────────────────────────
async function showAdminProducts(chatId) {
  const data = loadData();
  const kb = adminProductsKeyboard(data.products);
  await bot.sendMessage(chatId, '📦 مدیریت محصولات:', kb);
}

async function showProductAdmin(chatId, productId) {
  const data = loadData();
  const p = data.products.find(x => String(x.id) === String(productId));
  if (!p) {
    await bot.sendMessage(chatId, '❌ محصول یافت نشد.');
    return;
  }
  const info =
    `📦 <b>${escapeHtml(p.name)}</b>\n` +
    `وضعیت: ${p.active ? '✅ فعال' : '❌ غیرفعال'}\n` +
    `ایموجی: ${p.emoji || '—'}\n` +
    `ترتیب: ${escapeHtml(String(p.order || 0))}\n` +
    `قیمت اصلی: ${escapeHtml(formatPrice(p.originalPrice))}\n` +
    `قیمت تخفیف: ${escapeHtml(formatPrice(p.price))}\n` +
    `توضیحات: ${escapeHtml(p.description || '—')}\n` +
    `تعداد مدیا: ${(p.media || []).length}\n` +
    `تعداد فایل: ${(p.files || []).length}`;

  await bot.sendMessage(chatId, info, {
    parse_mode: 'HTML',
    ...adminProductActionsKeyboard(productId),
  });
}

// ─── Admin: Add Product ───────────────────────────────────────────────────────
function startAddProduct(chatId) {
  setAdminState(chatId, { step: 'add_name', data: {} });
  bot.sendMessage(chatId, '📦 *افزودن محصول جدید*\n\nمرحله ۱/۸: نام محصول را وارد کنید:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'admin_products' }]] },
  });
}

// ─── Admin: Edit Product ─────────────────────────────────────────────────────
function startEditField(chatId, field, productId) {
  const fieldNames = {
    name: 'نام محصول',
    emoji: 'ایموجی (یا بنویسید "بدون ایموجی")',
    desc: 'توضیحات محصول',
    prices: 'قیمت اصلی',
    order: 'ترتیب نمایش',
    media: 'مدیا (عکس/ویدیو) — یکی یکی ارسال کنید. وقتی تمام شد دکمه «پایان» را بزنید.',
    files: 'فایل‌ها — یکی یکی ارسال کنید. وقتی تمام شد دکمه «پایان» را بزنید.',
  };
  setAdminState(chatId, { step: `edit_${field}`, productId, data: {} });
  bot.sendMessage(chatId, `✏️ ویرایش: *${fieldNames[field] || field}*`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        ...(field === 'media' || field === 'files'
          ? [[{ text: '🗑 پاک کردن همه و شروع مجدد', callback_data: `ape_clear_${field}_${productId}` }]]
          : []),
        ...(field === 'media' || field === 'files'
          ? [[{ text: '✅ پایان ارسال', callback_data: `ape_done_${field}_${productId}` }]]
          : []),
        [{ text: '❌ انصراف', callback_data: `ap_view_${productId}` }],
      ],
    },
  });
}

// ─── Admin: Texts ────────────────────────────────────────────────────────────
async function showAdminTexts(chatId) {
  await bot.sendMessage(chatId, '✏️ ویرایش متون ربات:', adminTextsKeyboard());
}

// ─── Admin: Card ─────────────────────────────────────────────────────────────
async function showAdminCard(chatId) {
  const data = loadData();
  await bot.sendMessage(chatId, `💳 تنظیمات کارت:\n\nشماره: ${formatCardNumber(data.card.number)}\nصاحب: ${data.card.owner}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✏️ ویرایش شماره کارت', callback_data: 'acard_number' }],
        [{ text: '✏️ ویرایش نام صاحب حساب', callback_data: 'acard_owner' }],
        [{ text: '🔙 بازگشت', callback_data: 'admin_back' }],
      ],
    },
  });
}

// ─── Admin: Header Media (welcome page) ──────────────────────────────────────
async function showAdminHeaderMedia(chatId) {
  const data = loadData();
  await bot.sendMessage(
    chatId,
    `🖼 مدیای صفحه خوش‌آمد\nتعداد: ${(data.headerMedia || []).length}\n\nعکس یا ویدیو ارسال کنید:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗑 پاک کردن همه', callback_data: 'aheader_clear' }],
          [{ text: '🔙 بازگشت', callback_data: 'admin_back' }],
        ],
      },
    }
  );
  setAdminState(chatId, { step: 'header_media' });
}

// ─── Admin: Products Page Media ───────────────────────────────────────────────
async function showAdminProductsMedia(chatId) {
  const data = loadData();
  await bot.sendMessage(
    chatId,
    `🖼 مدیای صفحه محصولات\nتعداد: ${(data.productsPageMedia || []).length}\n\nعکس یا ویدیو ارسال کنید:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗑 پاک کردن همه', callback_data: 'aproductsmedia_clear' }],
          [{ text: '🔙 بازگشت', callback_data: 'admin_back' }],
        ],
      },
    }
  );
  setAdminState(chatId, { step: 'products_page_media' });
}

// ─── Admin: Stats ────────────────────────────────────────────────────────────
async function showAdminStats(chatId) {
  const data = loadData();
  const s = data.stats || {};
  const products = data.products || [];

  let productClicksText = '';
  for (const p of products) {
    const clicks = (s.productClicks || {})[p.id] || 0;
    const sales = (s.productSales || {})[p.id] || 0;
    productClicksText += `  • ${p.name}: ${clicks} بازدید | ${sales} فروش\n`;
  }

  const today = todayKey();
  const todayStats = (s.dailyStats || {})[today] || { starts: 0, sales: 0 };

  const text =
    `📊 آمار ربات\n\n` +
    `👥 کل استارت‌ها: ${s.starts || 0}\n` +
    `👤 کاربران یکتا: ${(s.uniqueUsers || []).length}\n` +
    `✅ فروش‌های تایید شده: ${s.confirmedSales || 0}\n\n` +
    `📅 آمار امروز:\n` +
    `  • استارت: ${todayStats.starts}\n` +
    `  • فروش: ${todayStats.sales}\n\n` +
    `📦 آمار محصولات:\n` +
    (productClicksText || '  هیچ محصولی وجود ندارد.');

  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'admin_back' }]],
    },
  });
}

// ─── Admin: Buyers ───────────────────────────────────────────────────────────
async function showAdminBuyers(chatId) {
  const data = loadData();
  const buyers = data.buyers || [];

  if (buyers.length === 0) {
    await bot.sendMessage(chatId, '🛒 هنوز خریداری ثبت نشده.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'admin_back' }]] },
    });
    return;
  }

  const last20 = buyers.slice(-20).reverse();
  let text = `🛒 آمار خریداران (${buyers.length} نفر):\n\n`;
  for (const b of last20) {
    const p = data.products.find(x => String(x.id) === String(b.productId));
    text += `👤 ${b.firstName} (${b.username})\n`;
    text += `📦 ${p ? p.name : b.productId}\n`;
    text += `📅 ${new Date(b.date).toLocaleDateString('fa-IR')}\n`;
    text += '─────────────\n';
  }
  if (buyers.length > 20) text += `\n... و ${buyers.length - 20} خریدار دیگر`;

  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'admin_back' }]],
    },
  });
}

// ─── Extract media ───────────────────────────────────────────────────────────
function extractMedia(msg) {
  if (!msg) return null;
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    return { type: 'photo', fileId: largest.file_id };
  }
  if (msg.video) {
    return { type: 'video', fileId: msg.video.file_id, name: msg.video.file_name };
  }
  if (msg.document) {
    return { type: 'document', fileId: msg.document.file_id, name: msg.document.file_name };
  }
  if (msg.audio) {
    return { type: 'document', fileId: msg.audio.file_id, name: msg.audio.file_name };
  }
  return null;
}

// ─── Message Handler ─────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const userId = msg.from ? msg.from.id : chatId;
  const text = msg.text || '';

  try {
    if (isAdmin(chatId)) {
      const state = getAdminState(chatId);

      if (state) {
        await handleAdminState(msg, state);
        return;
      }

      if (text === '/start' || text === '/admin') {
        await bot.sendMessage(chatId, '👑 پنل مدیریت', adminMenuKeyboard());
        return;
      }

      if (text.startsWith('/')) return;
    }

    if (text === '/start') {
      await handleStart(msg);
      return;
    }

    if (userPendingReceipt[userId]) {
      await handleReceiptFromUser(msg, userId);
      return;
    }
  } catch (e) {
    console.error('Message handler error:', e);
  }
});

// ─── Admin State Machine ─────────────────────────────────────────────────────
async function handleAdminState(msg, state) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const step = state.step;

  try {
    if (step === 'header_media') {
      const data = loadData();
      if (!data.headerMedia) data.headerMedia = [];
      const m = extractMedia(msg);
      if (m) {
        data.headerMedia.push(m);
        saveData(data);
        await bot.sendMessage(chatId, `✅ مدیا اضافه شد (مجموع: ${data.headerMedia.length})`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🗑 پاک کردن همه', callback_data: 'aheader_clear' }],
              [{ text: '✅ اتمام', callback_data: 'admin_back' }],
            ],
          },
        });
      }
      return;
    }

    if (step === 'products_page_media') {
      const data = loadData();
      if (!data.productsPageMedia) data.productsPageMedia = [];
      const m = extractMedia(msg);
      if (m) {
        data.productsPageMedia.push(m);
        saveData(data);
        await bot.sendMessage(chatId, `✅ مدیا اضافه شد (مجموع: ${data.productsPageMedia.length})`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🗑 پاک کردن همه', callback_data: 'aproductsmedia_clear' }],
              [{ text: '✅ اتمام', callback_data: 'admin_back' }],
            ],
          },
        });
      }
      return;
    }

    if (step === 'add_name') {
      if (!text.trim()) { await bot.sendMessage(chatId, '⚠️ نام نمی‌تواند خالی باشد.'); return; }
      state.data.name = text.trim();
      state.step = 'add_emoji';
      await bot.sendMessage(chatId, 'مرحله ۲/۸: ایموجی محصول را بفرستید (یا «بدون ایموجی» بنویسید):', {
        reply_markup: { inline_keyboard: [[{ text: '⏭ بدون ایموجی', callback_data: 'add_skip_emoji' }], [{ text: '❌ انصراف', callback_data: 'admin_products' }]] },
      });
      return;
    }

    if (step === 'add_emoji') {
      state.data.emoji = text.trim() === 'بدون ایموجی' ? '' : text.trim();
      state.step = 'add_order';
      await bot.sendMessage(chatId, 'مرحله ۳/۸: ترتیب نمایش را وارد کنید (عدد):', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1', callback_data: 'addorder_1' }, { text: '2', callback_data: 'addorder_2' }, { text: '3', callback_data: 'addorder_3' }],
            [{ text: '4', callback_data: 'addorder_4' }, { text: '5', callback_data: 'addorder_5' }],
            [{ text: '❌ انصراف', callback_data: 'admin_products' }],
          ],
        },
      });
      return;
    }

    if (step === 'add_order') {
      const n = parseInt(text, 10);
      if (isNaN(n) || n < 1) { await bot.sendMessage(chatId, '⚠️ عدد معتبر وارد کنید.'); return; }
      state.data.order = n;
      state.step = 'add_orig_price';
      await bot.sendMessage(chatId, 'مرحله ۴/۸: قیمت اصلی (تومان):');
      return;
    }

    if (step === 'add_orig_price') {
      const n = parseInt(text.replace(/,/g, ''), 10);
      if (isNaN(n)) { await bot.sendMessage(chatId, '⚠️ عدد معتبر وارد کنید.'); return; }
      state.data.originalPrice = n;
      state.step = 'add_price';
      await bot.sendMessage(chatId, 'مرحله ۵/۸: قیمت تخفیف‌خورده (تومان): (اگه تخفیف نداره همان عدد قبلی رو وارد کن)');
      return;
    }

    if (step === 'add_price') {
      const n = parseInt(text.replace(/,/g, ''), 10);
      if (isNaN(n)) { await bot.sendMessage(chatId, '⚠️ عدد معتبر وارد کنید.'); return; }
      state.data.price = n;
      state.step = 'add_desc';
      await bot.sendMessage(chatId, 'مرحله ۶/۸: توضیحات محصول:');
      return;
    }

    if (step === 'add_desc') {
      state.data.description = text.trim();
      state.step = 'add_media';
      state.data.media = [];
      await bot.sendMessage(chatId, 'مرحله ۷/۸: عکس یا ویدیوی محصول ارسال کنید (چند تا قابل ارساله):', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭ رد کردن (بدون مدیا)', callback_data: 'add_skip_media' }],
            [{ text: '✅ اتمام ارسال مدیا', callback_data: 'add_done_media' }],
          ],
        },
      });
      return;
    }

    if (step === 'add_media') {
      const m = extractMedia(msg);
      if (m) {
        state.data.media.push(m);
        await bot.sendMessage(chatId, `✅ مدیا اضافه شد (${state.data.media.length} عدد)`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ اتمام ارسال مدیا', callback_data: 'add_done_media' }],
              [{ text: '❌ انصراف', callback_data: 'admin_products' }],
            ],
          },
        });
      }
      return;
    }

    if (step === 'add_files') {
      const m = extractMedia(msg);
      if (m) {
        state.data.files.push(m);
        await bot.sendMessage(chatId, `✅ فایل اضافه شد (${state.data.files.length} عدد)`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ اتمام و ذخیره محصول', callback_data: 'add_done_files' }],
              [{ text: '❌ انصراف', callback_data: 'admin_products' }],
            ],
          },
        });
      }
      return;
    }

    if (step === 'edit_name') {
      if (!text.trim()) return;
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(state.productId));
      if (p) { p.name = text.trim(); saveData(data); }
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ نام ذخیره شد.');
      await showProductAdmin(chatId, state.productId);
      return;
    }

    if (step === 'edit_emoji') {
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(state.productId));
      if (p) {
        p.emoji = (text.trim() === 'بدون ایموجی' || text.trim() === '-') ? '' : text.trim();
        saveData(data);
      }
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ ایموجی ذخیره شد.');
      await showProductAdmin(chatId, state.productId);
      return;
    }

    if (step === 'edit_desc') {
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(state.productId));
      if (p) { p.description = text.trim(); saveData(data); }
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ توضیحات ذخیره شد.');
      await showProductAdmin(chatId, state.productId);
      return;
    }

    if (step === 'edit_prices_orig') {
      const n = parseInt(text.replace(/,/g, ''), 10);
      if (isNaN(n)) { await bot.sendMessage(chatId, '⚠️ عدد معتبر وارد کنید.'); return; }
      state.data.originalPrice = n;
      state.step = 'edit_prices_disc';
      await bot.sendMessage(chatId, 'قیمت تخفیف‌خورده (تومان): (اگه تخفیف نداره همان عدد قبلی رو وارد کن)');
      return;
    }

    if (step === 'edit_prices_disc') {
      const n = parseInt(text.replace(/,/g, ''), 10);
      if (isNaN(n)) { await bot.sendMessage(chatId, '⚠️ عدد معتبر وارد کنید.'); return; }
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(state.productId));
      if (p) { p.originalPrice = state.data.originalPrice; p.price = n; saveData(data); }
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ قیمت‌ها ذخیره شدند.');
      await showProductAdmin(chatId, state.productId);
      return;
    }

    if (step === 'edit_order') {
      const n = parseInt(text, 10);
      if (isNaN(n) || n < 1) { await bot.sendMessage(chatId, '⚠️ عدد معتبر وارد کنید.'); return; }
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(state.productId));
      if (p) { p.order = n; saveData(data); }
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ ترتیب ذخیره شد.');
      await showProductAdmin(chatId, state.productId);
      return;
    }

    if (step === 'edit_media') {
      const m = extractMedia(msg);
      if (m) {
        const data = loadData();
        const p = data.products.find(x => String(x.id) === String(state.productId));
        if (p) { p.media = p.media || []; p.media.push(m); saveData(data); }
        await bot.sendMessage(chatId, `✅ مدیا اضافه شد.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🗑 پاک کردن همه', callback_data: `ape_clear_media_${state.productId}` }],
              [{ text: '✅ پایان', callback_data: `ape_done_media_${state.productId}` }],
              [{ text: '❌ انصراف', callback_data: `ap_view_${state.productId}` }],
            ],
          },
        });
      }
      return;
    }

    if (step === 'edit_files') {
      const m = extractMedia(msg);
      if (m) {
        const data = loadData();
        const p = data.products.find(x => String(x.id) === String(state.productId));
        if (p) { p.files = p.files || []; p.files.push(m); saveData(data); }
        await bot.sendMessage(chatId, `✅ فایل اضافه شد.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🗑 پاک کردن همه', callback_data: `ape_clear_files_${state.productId}` }],
              [{ text: '✅ پایان', callback_data: `ape_done_files_${state.productId}` }],
              [{ text: '❌ انصراف', callback_data: `ap_view_${state.productId}` }],
            ],
          },
        });
      }
      return;
    }

    if (step && step.startsWith('edit_text_')) {
      const key = step.replace('edit_text_', '');
      if (!text.trim()) return;
      const data = loadData();
      data.texts[key] = text.trim();
      saveData(data);
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ متن ذخیره شد.', adminTextsKeyboard());
      return;
    }

    if (step === 'edit_card_number') {
      if (!text.trim()) return;
      const data = loadData();
      data.card.number = normalizeDigits(text.trim());
      saveData(data);
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ شماره کارت ذخیره شد.');
      await showAdminCard(chatId);
      return;
    }

    if (step === 'edit_card_owner') {
      if (!text.trim()) return;
      const data = loadData();
      data.card.owner = text.trim();
      saveData(data);
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ نام صاحب حساب ذخیره شد.');
      await showAdminCard(chatId);
      return;
    }
  } catch (e) {
    console.error('Admin state error:', e);
  }
}

// ─── Receipt Handler ─────────────────────────────────────────────────────────
async function handleReceiptFromUser(msg, userId) {
  const chatId = msg.chat.id;
  const data = loadData();
  const productId = userLastProduct[userId] || null;
  const product = productId ? data.products.find(p => String(p.id) === String(productId)) : null;

  delete userPendingReceipt[userId];

  const from = msg.from || {};
  const firstName = from.first_name || '—';
  const username = from.username ? `@${from.username}` : '—';
  const uid = from.id || chatId;
  const now = new Date().toLocaleString('fa-IR');

  let fileType = 'متن';
  if (msg.photo) fileType = 'عکس';
  else if (msg.video) fileType = 'ویدیو';
  else if (msg.document) fileType = 'فایل';

  const reportText =
    `📨 رسید جدید\n\n` +
    `👤 نام: ${firstName}\n` +
    `🔗 یوزرنیم: ${username}\n` +
    `🆔 آیدی: ${uid}\n` +
    `📦 محصول: ${product ? product.name : 'نامشخص'}\n` +
    `📅 زمان: ${now}\n` +
    `📎 نوع: ${fileType}\n` +
    `💬 متن: ${msg.text || msg.caption || '—'}`;

  try {
    await bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);
  } catch (e) {
    console.error('Forward failed:', e.message);
  }

  await bot.sendMessage(ADMIN_CHAT_ID, reportText, receiptAdminKeyboard(uid, productId || 'none'));
  await bot.sendMessage(chatId, '✅ رسیدتون دریافت شد! بعد از بررسی خبرتون می‌دیم 🙏', mainQuickLinksKeyboard());
}

// ─── Callback Query Handler ──────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  if (!query || !query.data) return;
  const chatId = query.message ? query.message.chat.id : null;
  if (!chatId) return;
  const userId = query.from ? query.from.id : chatId;
  const data_str = query.data;

  try {
    await bot.answerCallbackQuery(query.id).catch(() => {});

    // ─── Quick links ───
    if (data_str === 'quick_products') {
      const data = loadData();
      await handleProducts(chatId, data);
      return;
    }

    if (data_str === 'quick_guide') {
      const data = loadData();
      await bot.sendMessage(chatId, data.texts.guide, mainQuickLinksKeyboard());
      return;
    }

    if (data_str === 'quick_support') {
      const data = loadData();
      await bot.sendMessage(chatId, data.texts.support, mainQuickLinksKeyboard());
      return;
    }

    if (data_str === 'quick_back') {
      const data = loadData();
      await bot.sendMessage(chatId, data.texts.welcome, mainQuickLinksKeyboard());
      return;
    }

    // ─── User: view product ───
    if (data_str.startsWith('product_')) {
      const productId = data_str.replace('product_', '');
      await handleProductView(chatId, productId, userId);
      return;
    }

    // ─── User: send receipt ───
    if (data_str.startsWith('send_receipt_') || data_str === 'send_receipt_active') {
      userPendingReceipt[userId] = true;
      const data = loadData();
      await bot.sendMessage(chatId, data.texts.sendReceipt, {
        reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'cancel_receipt' }]] },
      });
      return;
    }

    if (data_str === 'cancel_receipt') {
      delete userPendingReceipt[userId];
      await bot.sendMessage(chatId, '❌ ارسال رسید لغو شد.', mainQuickLinksKeyboard());
      return;
    }

    // ─── Admin only from here ───
    if (!isAdmin(chatId)) return;

    if (data_str === 'admin_back') {
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '👑 پنل مدیریت', adminMenuKeyboard());
      return;
    }

    if (data_str === 'admin_products') {
      clearAdminState(chatId);
      await showAdminProducts(chatId);
      return;
    }

    if (data_str === 'admin_texts') {
      clearAdminState(chatId);
      await showAdminTexts(chatId);
      return;
    }

    if (data_str === 'admin_card') {
      clearAdminState(chatId);
      await showAdminCard(chatId);
      return;
    }

    if (data_str === 'admin_header_media') {
      await showAdminHeaderMedia(chatId);
      return;
    }

    if (data_str === 'admin_products_media') {
      await showAdminProductsMedia(chatId);
      return;
    }

    if (data_str === 'admin_stats') {
      clearAdminState(chatId);
      await showAdminStats(chatId);
      return;
    }

    if (data_str === 'admin_buyers') {
      clearAdminState(chatId);
      await showAdminBuyers(chatId);
      return;
    }

    if (data_str === 'admin_backup') {
      await sendBackup(chatId);
      return;
    }

    if (data_str === 'admin_reset_confirm') {
      await bot.sendMessage(chatId, '⚠️ آیا مطمئنید؟ *تمام داده‌ها پاک می‌شوند!*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑 بله، همه چیز را پاک کن', callback_data: 'admin_reset_do' }],
            [{ text: '❌ خیر، انصراف', callback_data: 'admin_back' }],
          ],
        },
      });
      return;
    }

    if (data_str === 'admin_reset_do') {
      resetAllData();
      await bot.sendMessage(chatId, '✅ تمام داده‌ها ریست شدند.', adminMenuKeyboard());
      return;
    }

    // ─── Header media clear ───
    if (data_str === 'aheader_clear') {
      const data = loadData();
      data.headerMedia = [];
      saveData(data);
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ هدر مدیا پاک شد.', adminMenuKeyboard());
      return;
    }

    if (data_str === 'aproductsmedia_clear') {
      const data = loadData();
      data.productsPageMedia = [];
      saveData(data);
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ مدیای صفحه محصولات پاک شد.', adminMenuKeyboard());
      return;
    }

    // ─── Products list ───
    if (data_str.startsWith('ap_view_')) {
      const productId = data_str.replace('ap_view_', '');
      clearAdminState(chatId);
      await showProductAdmin(chatId, productId);
      return;
    }

    if (data_str === 'ap_add') {
      startAddProduct(chatId);
      return;
    }

    // ─── Add product callbacks ───
    if (data_str === 'add_skip_emoji') {
      const state = getAdminState(chatId);
      if (state && state.step === 'add_emoji') {
        state.data.emoji = '';
        state.step = 'add_order';
        await bot.sendMessage(chatId, 'مرحله ۳/۸: ترتیب نمایش را وارد کنید (عدد):', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '1', callback_data: 'addorder_1' }, { text: '2', callback_data: 'addorder_2' }, { text: '3', callback_data: 'addorder_3' }],
              [{ text: '4', callback_data: 'addorder_4' }, { text: '5', callback_data: 'addorder_5' }],
              [{ text: '❌ انصراف', callback_data: 'admin_products' }],
            ],
          },
        });
      }
      return;
    }

    if (data_str.startsWith('addorder_')) {
      const n = parseInt(data_str.replace('addorder_', ''), 10);
      const state = getAdminState(chatId);
      if (state && state.step === 'add_order') {
        state.data.order = n;
        state.step = 'add_orig_price';
        await bot.sendMessage(chatId, `ترتیب انتخاب شد: ${n}\n\nمرحله ۴/۸: قیمت اصلی (تومان):`);
      }
      return;
    }

    if (data_str === 'add_skip_media' || data_str === 'add_done_media') {
      const state = getAdminState(chatId);
      if (!state) return;
      state.step = 'add_files';
      state.data.files = [];
      await bot.sendMessage(chatId, 'مرحله ۸/۸: فایل‌های دانلودی محصول را ارسال کنید:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭ رد کردن (بدون فایل)', callback_data: 'add_done_files' }],
            [{ text: '✅ اتمام و ذخیره محصول', callback_data: 'add_done_files' }],
          ],
        },
      });
      return;
    }

    if (data_str === 'add_done_files') {
      const state = getAdminState(chatId);
      if (!state || !state.data) return;
      const data = loadData();
      const newProduct = {
        id: `prod_${Date.now()}`,
        name: state.data.name || 'بدون نام',
        emoji: state.data.emoji || '',
        description: state.data.description || '',
        originalPrice: state.data.originalPrice || 0,
        price: state.data.price || 0,
        active: true,
        order: state.data.order || 1,
        media: state.data.media || [],
        files: state.data.files || [],
      };
      data.products.push(newProduct);
      saveData(data);
      clearAdminState(chatId);
      await bot.sendMessage(chatId, `✅ محصول «${newProduct.name}» اضافه شد!`);
      await showAdminProducts(chatId);
      return;
    }

    // ─── Edit product field ───
    if (data_str.startsWith('ape_name_')) {
      startEditField(chatId, 'name', data_str.replace('ape_name_', ''));
      return;
    }

    if (data_str.startsWith('ape_emoji_')) {
      const productId = data_str.replace('ape_emoji_', '');
      setAdminState(chatId, { step: 'edit_emoji', productId, data: {} });
      await bot.sendMessage(chatId, 'ایموجی جدید را بفرستید (یا «بدون ایموجی» یا «-» بنویسید):', {
        reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: `ap_view_${productId}` }]] },
      });
      return;
    }

    if (data_str.startsWith('ape_desc_')) {
      startEditField(chatId, 'desc', data_str.replace('ape_desc_', ''));
      return;
    }

    if (data_str.startsWith('ape_prices_')) {
      const productId = data_str.replace('ape_prices_', '');
      setAdminState(chatId, { step: 'edit_prices_orig', productId, data: {} });
      await bot.sendMessage(chatId, 'قیمت اصلی (تومان):', {
        reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: `ap_view_${productId}` }]] },
      });
      return;
    }

    if (data_str.startsWith('ape_order_')) {
      const productId = data_str.replace('ape_order_', '');
      setAdminState(chatId, { step: 'edit_order', productId, data: {} });
      await bot.sendMessage(chatId, 'ترتیب جدید را وارد کنید:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1', callback_data: `setorder_${productId}_1` }, { text: '2', callback_data: `setorder_${productId}_2` }, { text: '3', callback_data: `setorder_${productId}_3` }],
            [{ text: '4', callback_data: `setorder_${productId}_4` }, { text: '5', callback_data: `setorder_${productId}_5` }],
            [{ text: '❌ انصراف', callback_data: `ap_view_${productId}` }],
          ],
        },
      });
      return;
    }

    if (data_str.startsWith('setorder_')) {
      const parts = data_str.split('_');
      const productId = parts[1];
      const n = parseInt(parts[2], 10);
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(productId));
      if (p) { p.order = n; saveData(data); }
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ ترتیب ذخیره شد.');
      await showProductAdmin(chatId, productId);
      return;
    }

    if (data_str.startsWith('ape_media_')) {
      startEditField(chatId, 'media', data_str.replace('ape_media_', ''));
      return;
    }

    if (data_str.startsWith('ape_files_')) {
      startEditField(chatId, 'files', data_str.replace('ape_files_', ''));
      return;
    }

    if (data_str.startsWith('ape_clear_media_')) {
      const productId = data_str.replace('ape_clear_media_', '');
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(productId));
      if (p) { p.media = []; saveData(data); }
      await bot.sendMessage(chatId, '✅ مدیاهای محصول پاک شدند.');
      startEditField(chatId, 'media', productId);
      return;
    }

    if (data_str.startsWith('ape_clear_files_')) {
      const productId = data_str.replace('ape_clear_files_', '');
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(productId));
      if (p) { p.files = []; saveData(data); }
      await bot.sendMessage(chatId, '✅ فایل‌های محصول پاک شدند.');
      startEditField(chatId, 'files', productId);
      return;
    }

    if (data_str.startsWith('ape_done_media_')) {
      const productId = data_str.replace('ape_done_media_', '');
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ مدیاها ذخیره شدند.');
      await showProductAdmin(chatId, productId);
      return;
    }

    if (data_str.startsWith('ape_done_files_')) {
      const productId = data_str.replace('ape_done_files_', '');
      clearAdminState(chatId);
      await bot.sendMessage(chatId, '✅ فایل‌ها ذخیره شدند.');
      await showProductAdmin(chatId, productId);
      return;
    }

    if (data_str.startsWith('ape_toggle_')) {
      const productId = data_str.replace('ape_toggle_', '');
      const data = loadData();
      const p = data.products.find(x => String(x.id) === String(productId));
      if (p) { p.active = !p.active; saveData(data); }
      await bot.sendMessage(chatId, `✅ وضعیت محصول: ${p && p.active ? 'فعال ✅' : 'غیرفعال ❌'}`);
      await showProductAdmin(chatId, productId);
      return;
    }

    if (data_str.startsWith('ape_delete_')) {
      const productId = data_str.replace('ape_delete_', '');
      await bot.sendMessage(chatId, '⚠️ آیا مطمئنید؟', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ بله، حذف کن', callback_data: `ape_delete_confirm_${productId}` }],
            [{ text: '❌ خیر', callback_data: `ap_view_${productId}` }],
          ],
        },
      });
      return;
    }

    if (data_str.startsWith('ape_delete_confirm_')) {
      const productId = data_str.replace('ape_delete_confirm_', '');
      const data = loadData();
      data.products = data.products.filter(p => String(p.id) !== String(productId));
      saveData(data);
      await bot.sendMessage(chatId, '✅ محصول حذف شد.');
      await showAdminProducts(chatId);
      return;
    }

    // ─── Edit texts ───
    if (data_str.startsWith('atext_')) {
      const key = data_str.replace('atext_', '');
      const data = loadData();
      setAdminState(chatId, { step: `edit_text_${key}`, data: {} });
      await bot.sendMessage(
        chatId,
        `✏️ متن فعلی:\n\n${data.texts[key] || '—'}\n\nمتن جدید را بنویسید:`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'admin_texts' }]] } }
      );
      return;
    }

    // ─── Card ───
    if (data_str === 'acard_number') {
      setAdminState(chatId, { step: 'edit_card_number', data: {} });
      await bot.sendMessage(chatId, 'شماره کارت جدید را وارد کنید:', {
        reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'admin_card' }]] },
      });
      return;
    }

    if (data_str === 'acard_owner') {
      setAdminState(chatId, { step: 'edit_card_owner', data: {} });
      await bot.sendMessage(chatId, 'نام صاحب حساب را وارد کنید:', {
        reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'admin_card' }]] },
      });
      return;
    }

    // ─── Receipt admin actions ───
    if (data_str.startsWith('receipt_send_')) {
      const payload = data_str.slice('receipt_send_'.length);
      const firstUnderscore = payload.indexOf('_');
      if (firstUnderscore === -1) { await bot.sendMessage(chatId, '⚠️ داده نامعتبر است.'); return; }

      const targetUserId = payload.slice(0, firstUnderscore);
      const productId = payload.slice(firstUnderscore + 1);

      if (!productId || productId === 'none') {
        await bot.sendMessage(chatId, '⚠️ محصولی انتخاب نشده. از «ارسال محصول دیگر» استفاده کنید.');
        return;
      }

      const data = loadData();
      const product = data.products.find(p => String(p.id) === String(productId));
      if (!product) { await bot.sendMessage(chatId, '❌ محصول یافت نشد.'); return; }

      await sendProductFiles(targetUserId, product);
      await bot.sendMessage(targetUserId, data.texts.paymentConfirm, {
        reply_markup: mainQuickLinksKeyboard().reply_markup,
      });
      trackSale(data, targetUserId, productId, '', '');
      saveData(data);

      await finalizeAdminReceiptMessage(query, '✅ تراکنش تایید شده');
      await bot.sendMessage(chatId, `✅ فایل‌های «${product.name}» برای کاربر ارسال شدند.`);
      return;
    }

    if (data_str.startsWith('receipt_other_')) {
      const targetUserId = data_str.replace('receipt_other_', '');
      const data = loadData();
      await bot.sendMessage(chatId, 'کدام محصول ارسال شود؟', selectProductForUserKeyboard(data.products, targetUserId));
      return;
    }

    if (data_str.startsWith('sendother_')) {
      const payload = data_str.slice('sendother_'.length);
      const firstUnderscore = payload.indexOf('_');
      if (firstUnderscore === -1) { await bot.sendMessage(chatId, '⚠️ داده نامعتبر است.'); return; }

      const targetUserId = payload.slice(0, firstUnderscore);
      const productId = payload.slice(firstUnderscore + 1);

      const data = loadData();
      const product = data.products.find(p => String(p.id) === String(productId));
      if (!product) { await bot.sendMessage(chatId, '❌ محصول یافت نشد.'); return; }

      await sendProductFiles(targetUserId, product);
      await bot.sendMessage(targetUserId, data.texts.paymentConfirm, {
        reply_markup: mainQuickLinksKeyboard().reply_markup,
      });
      trackSale(data, targetUserId, productId, '', '');
      saveData(data);

      await finalizeAdminReceiptMessage(query, '✅ تراکنش تایید شده');
      await bot.sendMessage(chatId, `✅ فایل‌های «${product.name}» برای کاربر ارسال شدند.`);
      return;
    }

    if (data_str.startsWith('receipt_reject_')) {
      const targetUserId = data_str.replace('receipt_reject_', '');
      const data = loadData();
      await bot.sendMessage(targetUserId, data.texts.paymentReject, {
        reply_markup: mainQuickLinksKeyboard().reply_markup,
      });
      await finalizeAdminReceiptMessage(query, '❌ تراکنش رد شد');
      await bot.sendMessage(chatId, '✅ پیام رد پرداخت ارسال شد.');
      return;
    }
  } catch (e) {
    console.error('Callback error:', e);
    try { await bot.sendMessage(chatId, '⚠️ خطایی رخ داد. دوباره تلاش کنید.'); } catch (_) {}
  }
});

// ─── Backup ──────────────────────────────────────────────────────────────────
async function sendBackup(chatId) {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      await bot.sendMessage(chatId, '⚠️ فایل داده وجود ندارد.');
      return;
    }
    await bot.sendDocument(chatId, DATA_PATH, {}, { filename: `backup_${Date.now()}.json` });
  } catch (e) {
    console.error('Backup error:', e);
    await bot.sendMessage(chatId, '❌ خطا در ارسال بکاپ.');
  }
}

// ─── Error Handlers ──────────────────────────────────────────────────────────
bot.on('polling_error', (err) => { console.error('Polling error:', err.message); });
process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled rejection:', reason); });

console.log('🤖 ربات فروش فایل در حال اجرا...');
