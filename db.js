const mongoose = require('mongoose');

// ==========================
// MongoDB ulanish
// ==========================
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('⚠️  MONGODB_URI topilmadi. Bot faqat xotirada (RAM) ishlaydi, ma\'lumotlar restart bo\'lganda o\'chib ketadi!');
    return false;
  }

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi');
    return true;
  } catch (error) {
    console.error('❌ MongoDB ga ulanishda xatolik:', error.message);
    console.warn('⚠️  Bot xotirada (RAM) rejimida davom etadi.');
    return false;
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB bilan aloqa uzildi');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB bilan aloqa tiklandi');
});

// ==========================
// Schemalar
// ==========================
// Ma'lumotlar shakli botning turli joylarida farq qiladi, shuning uchun
// har bir hujjatda erkin (Mixed) "data" maydonida to'liq obyektni saqlaymiz.
const UserSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Telegram userId
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false, collection: 'users' });

const BattleSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.Mixed, required: true }, // battleId (number yoki string bo'lishi mumkin)
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false, collection: 'battles' });

const PaidBattleSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.Mixed, required: true }, // battleId
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false, collection: 'paid_battles' });

const UserModel = mongoose.model('User', UserSchema);
const BattleModel = mongoose.model('Battle', BattleSchema);
const PaidBattleModel = mongoose.model('PaidBattle', PaidBattleSchema);

// ==========================
// Yordamchi: Map <-> oddiy obyekt
// ==========================
// Mongo ichiga Map obyektini to'g'ridan-to'g'ri saqlab bo'lmaydi,
// shuning uchun saqlashdan oldin Map'larni oddiy obyektga aylantiramiz.
function serializeValue(value) {
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) {
      obj[k] = serializeValue(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const obj = {};
    for (const key of Object.keys(value)) {
      obj[key] = serializeValue(value[key]);
    }
    return obj;
  }
  return value;
}

// Yuklashda "votes" kabi maydonlarni qaytadan Map'ga aylantiramiz
function deserializeBattle(data) {
  if (data && data.votes && typeof data.votes === 'object' && !(data.votes instanceof Map)) {
    data.votes = new Map(Object.entries(data.votes));
  }
  return data;
}

// ==========================
// CRUD funksiyalari (xatolik chiqsa botni yiqitmaslik uchun try/catch bilan)
// ==========================
async function saveUser(userId, data) {
  if (!isDBConnected()) return;
  try {
    await UserModel.updateOne(
      { _id: Number(userId) },
      { $set: { data: serializeValue(data) } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`❌ Foydalanuvchi (${userId}) saqlashda xatolik:`, error.message);
  }
}

async function deleteUser(userId) {
  if (!isDBConnected()) return;
  try {
    await UserModel.deleteOne({ _id: Number(userId) });
  } catch (error) {
    console.error(`❌ Foydalanuvchi (${userId}) o'chirishda xatolik:`, error.message);
  }
}

async function saveBattle(battleId, data) {
  if (!isDBConnected()) return;
  try {
    await BattleModel.updateOne(
      { _id: battleId },
      { $set: { data: serializeValue(data) } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`❌ Battle (${battleId}) saqlashda xatolik:`, error.message);
  }
}

async function deleteBattle(battleId) {
  if (!isDBConnected()) return;
  try {
    await BattleModel.deleteOne({ _id: battleId });
  } catch (error) {
    console.error(`❌ Battle (${battleId}) o'chirishda xatolik:`, error.message);
  }
}

async function savePaidBattle(battleId, data) {
  if (!isDBConnected()) return;
  try {
    await PaidBattleModel.updateOne(
      { _id: battleId },
      { $set: { data: serializeValue(data) } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`❌ Paid battle (${battleId}) saqlashda xatolik:`, error.message);
  }
}

async function deletePaidBattle(battleId) {
  if (!isDBConnected()) return;
  try {
    await PaidBattleModel.deleteOne({ _id: battleId });
  } catch (error) {
    console.error(`❌ Paid battle (${battleId}) o'chirishda xatolik:`, error.message);
  }
}

function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

// Botni ishga tushirishda MongoDB'dan barcha ma'lumotlarni xotiraga yuklaydi
async function loadAllData({ users, battles, paidBattles }) {
  if (!isDBConnected()) {
    console.warn('⚠️  MongoDB ulanmagan, ma\'lumotlar yuklanmadi (bo\'sh holatda boshlaymiz).');
    return;
  }

  try {
    const userDocs = await UserModel.find({}).lean();
    for (const doc of userDocs) {
      users.set(doc._id, doc.data);
    }
    console.log(`📥 ${userDocs.length} ta foydalanuvchi MongoDB'dan yuklandi`);

    const battleDocs = await BattleModel.find({}).lean();
    for (const doc of battleDocs) {
      battles.set(doc._id, deserializeBattle(doc.data));
    }
    console.log(`📥 ${battleDocs.length} ta battle MongoDB'dan yuklandi`);

    const paidBattleDocs = await PaidBattleModel.find({}).lean();
    for (const doc of paidBattleDocs) {
      paidBattles.set(doc._id, doc.data);
    }
    console.log(`📥 ${paidBattleDocs.length} ta pullik battle MongoDB'dan yuklandi`);
  } catch (error) {
    console.error('❌ Ma\'lumotlarni yuklashda xatolik:', error.message);
  }
}

module.exports = {
  connectDB,
  isDBConnected,
  loadAllData,
  saveUser,
  deleteUser,
  saveBattle,
  deleteBattle,
  savePaidBattle,
  deletePaidBattle,
};
