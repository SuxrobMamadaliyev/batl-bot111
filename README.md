# BattleForge - Telegram Battle Bot

## O'zbekcha

### Tavsif
BattleForge - bu Telegram orqali battle (jang) o'tkazish uchun yaratilgan bot. Foydalanuvchilar o'z jamoalari yoki kanallari uchun qiziqarli battlelar yaratishlari mumkin.

### O'rnatish

1. Dastlabki talablar:
   - Node.js (14.0.0 yoki undan yuqori)
   - npm (6.0.0 yoki undan yuqori)
   - Telegram bot tokeni [@BotFather](https://t.me/botfather) orqali olingan

2. Dasturni yuklab olish va kerakli modullarni o'rnatish:
   ```bash
   git clone [repository-url]
   cd battle-forge-bot
   npm install
   ```

3. Konfiguratsiya faylini yaratish:
   `.env` faylini yarating va quyidagi ma'lumotlarni kiriting:
   ```
   BOT_TOKEN=sizning_bot_tokeningiz
   ADMIN_IDS=5735723011  # Admin ID lari vergul bilan ajratilgan holda
   PORT=10000
   RENDER=true
   RENDER_EXTERNAL_URL=https://your-render-app-url.onrender.com
   ```

### Ishga tushirish

#### Mahalliy serverda ishga tushirish (rivojlanish uchun):
```bash
npm run dev
```

#### Ishlab chiqarish serverida ishga tushirish:
```bash
npm start
```

## Русский

### Описание
BattleForge - это бот для проведения баттлей (сражений) через Telegram. Пользователи могут создавать интересные баттли для своих команд или каналов.

### Установка

1. Требования:
   - Node.js (14.0.0 или выше)
   - npm (6.0.0 или выше)
   - Токен бота Telegram, полученный у [@BotFather](https://t.me/botfather)

2. Клонирование репозитория и установка зависимостей:
   ```bash
   git clone [repository-url]
   cd battle-forge-bot
   npm install
   ```

3. Настройка конфигурации:
   Создайте файл `.env` и добавьте следующие переменные:
   ```
   BOT_TOKEN=ваш_токен_бота
   ADMIN_IDS=5735723011  # ID администраторов через запятую
   PORT=10000
   RENDER=true
   RENDER_EXTERNAL_URL=https://your-render-app-url.onrender.com
   ```

### Запуск

#### Локальный запуск (для разработки):
```bash
npm run dev
```

#### Запуск на продакшн сервере:
```bash
npm start
```

## Лицензия
Этот проект распространяется под лицензией ISC.
