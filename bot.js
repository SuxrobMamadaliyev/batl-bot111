require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

// Bot tokenini .env fayldan o'qiymiz
const bot = new Telegraf(process.env.BOT_TOKEN);

// Kanalingiz ID si va Admin ID si
const CHANNEL_ID = process.env.CHANNEL_ID; 
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Ma'lumotlar bazasi (Sodda ko'rinishda, real loyihada MongoDB yoki PostgreSQL tavsiya etiladi)
let config = {
    minStarsStage1: 50,
    minStarsStage2: 150,
    minStarsStage3: 300,
    voteCost: 5 // 1 ta ovoz narxi (Stars)
};

let currentBattle = {
    stage: 1, // 1, 2, 3-bosqichlar
    status: 'idle', // 'idle' yoki 'active'
    participants: [
        { id: 12345678, name: "Alisher", votes: 0 },
        { id: 87654321, name: "Jasur", votes: 0 },
        { id: 98765432, name: "Sardor", votes: 0 }
    ]
};

// ================= ADMIN PANEL =================
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Siz admin emassiz!");

    return ctx.reply(
        `👑 *Admin Panelga xush kelibsiz!*\n\n` +
        `📊 *Hozirgi sozlamalar:*\n` +
        `▫️ 1-Bosqich limiti: ${config.minStarsStage1} ⭐️\n` +
        `▫️ 2-Bosqich limiti: ${config.minStarsStage2} ⭐️\n` +
        `▫️ 3-Bosqich limiti: ${config.minStarsStage3} ⭐️\n` +
        `▫️ Ovoz narxi: ${config.voteCost} ⭐️\n\n` +
        `Hozirgi batl holati: *${currentBattle.status.toUpperCase()}* (Bosqich: ${currentBattle.stage})`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Batlni Boshlash', 'start_battle')],
            [Markup.button.callback('⏭ Keyingi Bosqichga O'tkazish', 'next_stage')],
            [Markup.button.callback('❌ Batlni Yakunlash', 'stop_battle')]
        ])
    );
});

// Admin tugmalari boshqaruvi
bot.action('start_battle', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    currentBattle.status = 'active';
    currentBattle.stage = 1;
    // Reset votes
    currentBattle.participants.forEach(p => p.votes = 0);
    await sendBattlePost(ctx);
    ctx.reply("⚡ 1-Bosqich batl posti kanalga joylandi!");
});

bot.action('next_stage', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await checkStageAndProgress(ctx);
});

bot.action('stop_battle', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    currentBattle.status = 'idle';
    await ctx.telegram.sendMessage(CHANNEL_ID, `❌ Batl to'xtatildi.`, { parse_mode: 'Markdown' });
    ctx.reply("Batl yakunlandi!");
});

// ================= BATL POSTINI KANALGA JO'NATISH =================
async function sendBattlePost(ctx) {
    let text = `⚔️ *Ajoyib Batl Konkurs boshlandi! (${currentBattle.stage}-Bosqich)*\n\n`;
    let buttons = [];

    // Hozirgi bosqich shartini aniqlash
    let currentLimit = config[`minStarsStage${currentBattle.stage}`];
    text += `⚠️ *Keyingi bosqichga o'tish uchun minimal chegara:* ${currentLimit} ⭐️\n\n`;

    currentBattle.participants.forEach((user) => {
        text += `💎 [${user.name}](tg://user?id=${user.id}) — *${user.votes} ⭐️*\n`;
        
        // Premium ikonka bilan ovoz berish tugmalari
        buttons.push([
            Markup.button.url(`🌟 ${user.name}ga ovoz berish (+${config.voteCost} ⭐️)`, `https://t.me/${ctx.botInfo.username}?start=vote_${user.id}`)
        ]);
    });

    text += `\n*Pastdagi premium tugmalarni bosib, shaxsiy chatda o'zingizga yoqqan ishtirokchiga haqiqiy Telegram Stars orqali ovoz bering!*`;

    await ctx.telegram.sendMessage(CHANNEL_ID, text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
}

// ================= TELEGRAM STARS TO'LOV TIZIMI =================
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    
    if (payload && payload.startsWith('vote_')) {
        const userId = parseInt(payload.split('_')[1]);
        const targetUser = currentBattle.participants.find(u => u.id === userId);

        if (!targetUser || currentBattle.status !== 'active') {
            return ctx.reply("❌ Bu batl yakunlangan yoki ishtirokchi topilmadi.");
        }

        // Telegram Stars hisobi uchun Invoice (Chek) yuborish
        return ctx.replyWithInvoice({
            title: `🌟 ${targetUser.name} uchun ovoz berish`,
            description: `Batlda ishtirokchini qo'llab-quvvatlash uchun ${config.voteCost} Telegram Stars to'lang.`,
            payload: `vote_for_${userId}`,
            provider_token: '', // Telegram Stars uchun bo'sh qoldiriladi
            currency: 'XTR', // Telegram Stars valyuta kodi
            prices: [{ label: 'Ovoz (Stars)', amount: config.voteCost }]
        });
    }

    ctx.reply("👋 Botga xush kelibsiz! Konkursda qatnashish uchun kanaldagi postlarni kuzating.");
});

// To'lovdan oldingi tekshiruv (Majburiy)
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// To'lov muvaffaqiyatli yakunlanganda ovozni hisoblash
bot.on('successful_payment', async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    
    if (payload.startsWith('vote_for_')) {
        const userId = parseInt(payload.split('_')[2]);
        const targetUser = currentBattle.participants.find(u => u.id === userId);

        if (targetUser) {
            targetUser.votes += config.voteCost;
            ctx.reply(`✅ Rahmat! ${targetUser.name} hamyoniga ${config.voteCost} ta ovoz (Stars) muvaffaqiyatli qo'shildi!`);
        }
    }
});

// ================= BOSQICHNI TEKSHIRISH VA AVTOMATLASHTIRISH =================
async function checkStageAndProgress(ctx) {
    let currentLimit = config[`minStarsStage${currentBattle.stage}`];
    
    // Ovozlar bo'yicha kamayish tartibida saralash
    currentBattle.participants.sort((a, b) => b.votes - a.votes);

    let winner = currentBattle.participants[0];

    // Minimal Stars tekshiruvi
    if (winner.votes < currentLimit) {
        currentBattle.status = 'idle';
        return ctx.telegram.sendMessage(CHANNEL_ID, `❌ *Batl yakunlandi.* Afsuski, g'olib [${winner.name}](tg://user?id=${winner.id}) minimal belgilangan ${currentLimit} ⭐️ chegarani bajara olmadi. Yutuq berilmaydi.`, { parse_mode: 'Markdown' });
    }

    if (currentBattle.stage === 1) {
        // 2-bosqichga faqat eng ko'p ovoz yig'gan 2 kishi o'tadi (3 kishidan 1 tasi chiqib ketadi)
        currentBattle.stage = 2;
        currentBattle.participants = currentBattle.participants.slice(0, 2).map(u => ({ ...u, votes: 0 })); // Ovozlarni nolga tushiramiz
        await sendBattlePost(ctx);
        ctx.reply("⚡ 2-Bosqich (Yarim final) posti kanalga joylandi!");

    } else if (currentBattle.stage === 2) {
        // 3-bosqich (Final)
        currentBattle.stage = 3;
        currentBattle.participants = currentBattle.participants.slice(0, 2).map(u => ({ ...u, votes: 0 })); 
        await sendBattlePost(ctx);
        ctx.reply("⚡ 3-Bosqich (Final) posti kanalga joylandi!");

    } else if (currentBattle.stage === 3) {
        // Mutloq g'olib
        currentBattle.status = 'idle';
        await ctx.telegram.sendMessage(CHANNEL_ID, `🏆 *URRAAA! Batl g'olibi aniqlandi!*\n\n👑 Mutloq g'olib: [${winner.name}](tg://user?id=${winner.id})\n🔥 Jami to'plagan Stars: *${winner.votes} ⭐️*\n\nTabriklaymiz! Tez orada yutuq topshiriladi.`, { parse_mode: 'Markdown' });
        ctx.reply("🏆 Final tugadi, g'olib kanalga e'lon qilindi!");
    }
}

// Error handling
bot.catch((err, ctx) => {
    console.log('Telegraf error', err);
});

bot.launch().then(() => console.log("🤖 Batl bot muvaffaqiyatli ishga tushdi!"));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
