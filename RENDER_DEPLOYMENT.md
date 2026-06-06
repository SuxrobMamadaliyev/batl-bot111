# RENDER DEPLOYMENT GUIDE

## 🚀 Render.com'da Deploy Qilish - To'liq Ko'rsatma

### 1️⃣ GITHUB TAYYORLASH

Barcha fayllar GitHub'da joylangan bo'lishi kerak:

```bash
# Repository'ni klonlang (agar allaqachon klonlangan bo'lmasa)
git clone https://github.com/SuxrobMamadaliyev/batl-bot111.git
cd batl-bot111

# Yangi o'zgarishlarni qo'shing
git add .

# Commit qiling
git commit -m "Deploy to Render: Telegram Stars Battle Bot"

# GitHub'ga push qiling
git push origin main
```

### 2️⃣ RENDER.COM'DA HISOBOT YARATING

1. https://render.com ga o'ting
2. **Sign Up** yoki **Sign In** qiling (GitHub account bilan)
3. GitHub ni ruxsat bering
4. **Dashboard** ga o'ting

### 3️⃣ YA'NI WEB SERVICE YARATING

**Qadamlar:**

1. **Dashboard** → **Create +** → **Web Service**
2. **Connect to GitHub**ni bosing
3. Repository'ni tanlang: `SuxrobMamadaliyev/batl-bot111`
4. **Select** qiling

### 4️⃣ DEPLOY SOZLAMALARI

Quyidagi sozlamalarni to'ldiring:

| Sozlama | Qiymati |
|---------|---------|
| **Name** | `telegram-stars-battle-bot` (yoki istalgan nom) |
| **Environment** | `Node` |
| **Region** | Singapore yoki Ohio (tezroq) |
| **Branch** | `main` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### 5️⃣ ENVIRONMENT VARIABLELER QOSHING

**Render Dashboard'da:**

1. **Environment** bo'limiga o'ting
2. **Add Environment Variable** qiling

Quyidagi variablelerni qo'shing:

```
BOT_TOKEN = YOUR_BOT_TOKEN_HERE
CHANNEL_ID = -100YOUR_CHANNEL_ID_HERE
ADMIN_ID = YOUR_ADMIN_ID_HERE
NODE_ENV = production
```

**Qiymatlarini Qanday Olish:**

- **BOT_TOKEN**: @BotFather'dan bot yaratib oling
  ```
  /newbot → Nom kiriting → Token olasiz
  ```
  
- **CHANNEL_ID**: Kanalni @userinfobot ga forward qiling
  ```
  Forward qiling → ID ni ko'rasiz (Boshida minus bo'ladi)
  ```
  
- **ADMIN_ID**: Shaxsiy ID'ni olish
  ```
  @userinfobot ga /start → ID ni ko'rasiz
  ```

### 6️⃣ DEPLOY QILISH

1. Render'da **Create Web Service** qiling
2. Deploy avtomatik ravishda boshlanadi
3. **Logs** bo'limida kuzataveriniz

**Kutish vaqti:** 5-10 minut

### 7️⃣ DEPLOY TEKSHIRISH

**Logs'da quyidagicha ko'rinishi kerak:**

```
🤖 Batl bot muvaffaqiyatli ishga tushdi!
```

Agar xatolik bo'lsa:
- **Logs** ni tekshiring
- Environment variable'larni tekshiring
- Bot token to'g'ri bo'lishini tekshiring

### 8️⃣ AVTOMATIK UPDATES

GitHub'da o'zgarish push qilganingizda:
1. Render avtomatik ravishda yangi deploy qiladi
2. Logs'da kuzataveriniz
3. Bot avtomatik yangilanadi

## 🔄 RENDER LOGS NI KO'RISH

1. Render Dashboard → Service → **Logs** tab
2. Real-time logs ni ko'rasiz
3. Xatoliklar ushbu joyda ko'rinadi

## ❌ MUAMMOLARNI HAL QILISH

### Bot Javob Bermaydi

**Sababi:** BOT_TOKEN noto'g'ri yoki environment variable'lar qo'shilmagan

**Hal qilish:**
1. BOT_TOKEN to'g'ri ekanini tekshiring
2. @BotFather'dan token qayta oling
3. Render'da variable'larni qayta qo'shing
4. Service'ni restart qiling

### Kanālga Post Chiqmaydi

**Sababi:** CHANNEL_ID noto'g'ri

**Hal qilish:**
1. CHANNEL_ID to'g'ri ekanini tekshiring (boshida minus bo'lishi kerak)
2. Bot kanalga admin huquqi borini tekshiring
3. Logs'ni tekshiring

### Deployment Xatosi

**Logs'dan Xatolik Ko'ring:**
```
npm install buyrug'i failed
```

**Hal qilish:**
1. package.json'ni tekshiring
2. npm versiyasini tekshiring (>=8.0.0)
3. node versiyasini tekshiring (>=18.x)

## 📊 PERFORMANCE SOZLAMALAR

**Render Free Plan:**
- Ram: 0.5GB
- CPU: Shared
- Yetarli: 50-100 oylik foydalanuvchi uchun

**Upgrade uchun:** Plan'ni Render'da o'zgartiring

## 🔐 XAVFSIZLIK ESLATMALARI

✅ **Qo'yish kerak:**
- Environment variable'larda `.env` berilmaydi
- Render'da `.env` file saqlanmaydi
- Token private qoladi

❌ **Qo'ymang:**
- `.env` faylini GitHub'da commit qilmang
- Token'ni code'ga yozmang
- Admin ID'ni public qilmang

## 🚨 RESTART QILISH

Agar bot "hang" qilsa:

1. Render Dashboard → Service
2. **Manual Deploy** → **Deploy** qiling
3. Bot restart bo'ladi

## 📞 YORDAMLAR

**Muammo**: Xatolik "Error: connect ECONNREFUSED"
**Sababi**: Bot server'da turmayotgan
**Hal qilish**: Logs'ni o'qiydi, code'ni tekshiring

**Muammo**: Render vaqt-vaqt deploy qiladi
**Sababi**: Health check muvaffaqiyatli bo'lmayotgan
**Hal qilish**: /ping buyrug'i qo'shing

---

**Deploy muvaffaqiyatli bo'lsa:**
✅ Bot 24/7 ishga tushadi
✅ GitHub update → Render auto deploy
✅ Free hosting Render'da

**Agar savollar bo'lsa:** GitHub Issues'da muammo ochavering!
