# 🌟 Telegram Stars Battle Bot

Node.js orqali Telegram Stars (XTR) tizimida ishlayadigan, premium ikonkalarga ega va 3 bosqichli avtomatlashgan Battle bot.

## 📋 Xususiyatlari

- ⚔️ **3-Bosqichli Batl Tizimi**: 1-bosqich → 2-bosqich (Yarim Final) → 3-bosqich (Final)
- 🌟 **Telegram Stars Bilan To'lov**: Haqiqiy XTR valyutasi orqali ovoz berish
- 👑 **Admin Panel**: To'liq boshqaruv paneli
- 💎 **Premium Tugmalar**: Kanaldagi mahsus tugmalar bilan foydalanuvchi interfeysı
- 🚀 **Avtomatlashgan Tizim**: Minimal chegara tekshiruvi va bosqichma-bosqich o'tkazish

## 🛠️ Talablar

- **Node.js**: v18.x yoki yuqori
- **NPM**: v8.0.0 yoki yuqori

## 📦 O'rnatish

```bash
# Repositoriyani klonlang
git clone https://github.com/SuxrobMamadaliyev/batl-bot111.git
cd batl-bot111

# Dependency o'rnating
npm install
```

## ⚙️ Konfiguratsiya

1. `.env.example` faylini `.env` sifatida nusxalab oling:
```bash
cp .env.example .env
```

2. `.env` faylini o'zingizning ma'lumotlaringiz bilan to'ldiring:
```env
BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRsTUVwXyZ
CHANNEL_ID=-100123456789
ADMIN_ID=543210987
NODE_ENV=production
```

**Ma'lumotlaringizni qanday topish kerak:**
- **BOT_TOKEN**: @BotFather dan bot yaratib oling
- **CHANNEL_ID**: Kanalni @userinfobot ga forward qilib, ID'ni olish
- **ADMIN_ID**: Shaxsiy ID'ni @userinfobot orqali topish

## 🚀 Ishga Tushirish

**Lokal Ishga Tushirish (Development):**
```bash
npm run dev
```

**Production Ishga Tushirish:**
```bash
npm start
```

## 📱 Bot Buyruqlari

- `/admin` - Admin panelni ochish (faqat admin uchun)
- `/start` - Botni boshlash

## 🎮 Batl Jarayoni

### 1️⃣ **1-Bosqich** 
- 3 ishtirokchi o'rtasida birinchi turun
- Minimal chegara: **50 ⭐️**
- Eng ko'p ovoz yig'gan 2 kishi keyingi bosqichga o'tadi
- Ovozlar nollanib qayta boshlanadi

### 2️⃣ **2-Bosqich (Yarim Final)** 
- Top 2 ishtirokchi o'rtasida
- Minimal chegara: **150 ⭐️**
- G'olib final bosqichga o'tadi
- Ovozlar nollanib qayta boshlanadi

### 3️⃣ **3-Bosqich (Final)** 
- Mutloq g'olib aniqlash
- Minimal chegara: **300 ⭐️**
- Eng ko'p ovoz to'plagan foydalanuvchi g'olib
- G'olib kanalda e'lon qilinadi

## 💰 Ovoz Narxlari

| Toifa | Narx |
|-------|------|
| Bir ovoz | 5 XTR |

## 🌐 Render.com'da Deploy Qilish

### Step 1: GitHub Repositoriyasini Tayyor Qiling
Barcha fayllar GitHub'da joylangan bo'lishi kerak:
```bash
git add .
git commit -m "Initial commit: Telegram Stars Battle Bot"
git push origin main
```

### Step 2: Render.com'da Hisobot Yarating

1. [render.com](https://render.com) ga o'ting
2. GitHub account bilan kirish
3. **Dashboard** → **New +** → **Web Service**
4. GitHub repositoriyasini ulang

### Step 3: Deploy Sozlamalari

**Build Settings:**
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

### Step 4: Environment Variableler Qo'shish

Render dashboard'da **Environment** bo'limiga quyidagi variablelerni qo'shing:

```
BOT_TOKEN=YOUR_BOT_TOKEN_HERE
CHANNEL_ID=-100YOUR_CHANNEL_ID_HERE
ADMIN_ID=YOUR_ADMIN_ID_HERE
NODE_ENV=production
```

### Step 5: Deploy Qilish

Render avtomatik ravishda GitHub'dan code pull qilib deploy qiladi.

## 📊 Admin Panel Foydalanish

1. `/admin` buyrug'ini bosing
2. Quyidagi tugmalarni ko'rasiz:
   - **🚀 Batlni Boshlash** - Yangi batl yaratish
   - **⏭ Keyingi Bosqichga O'tkazish** - Bosqich o'tkazish
   - **❌ Batlni Yakunlash** - Batl to'xtatish

## 🔐 Xavfsizlik Eslatmalari

✅ **Qo'yish kerak:**
- `.env` faylni `.gitignore`ga qo'shing
- Bot token va Admin ID'ni **hech qachon public qilmang**

❌ **Qo'ymang:**
- `.env` faylini **hech qachon GitHub'da** commit qilmang

## 📚 Kutubxonalar

- telegraf: ^4.15.0
- dotenv: ^16.3.1
- mongoose: ^8.0.0
- axios: ^1.6.0

## 📄 Litsenziya

MIT Litsenziyasi

## 👨‍💻 Muallif

**Suhrob Mamadaliyev** - [@SuxrobMamadaliyev](https://github.com/SuxrobMamadaliyev)
