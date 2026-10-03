const { execSync } = require('child_process');
require('dotenv').config();

// === НОВЫЕ ИМПОРТЫ ДЛЯ СЕРВЕРА ===
const express = require('express');
const cors = require('cors');
// =================================

console.log('🚀 Запуск NEURON VPN...');

// ШАГ 1: Генерируем Prisma Client ПЕРЕД тем, как его импортировать
try {
  console.log('🔄 1. Генерация Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  
  console.log('🔄 2. Синхронизация схемы с базой данных (создание таблиц)...');
  execSync('npx prisma db push', { stdio: 'inherit' });
  
  console.log('✅ База данных и Prisma полностью готовы!');
} catch (error) {
  console.error('❌ Критическая ошибка инициализации БД:', error.message);
  process.exit(1); // Останавливаем бота, если БД не готова
}

// ШАГ 2: Только ТЕПЕРЬ импортируем Prisma и бота
const prisma = require('./db');
const { Bot } = require('grammy');

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  const telegramId = BigInt(ctx.from.id);
  const username = ctx.from.username;
  const fullName = (ctx.from.first_name || '') + ' ' + (ctx.from.last_name || '');
  
  try {
    let student = await prisma.student.findUnique({ where: { telegramId } });
    
    if (!student) {
      student = await prisma.student.create({
        data: { telegramId, username, fullName }
      });
      await ctx.reply(
        `👋 *Привет, ${username || 'студент'}!*\n\n` +
        `✅ Я тебя запомнил в базе данных.\n` +
        `📱 Твой ID: \`${telegramId}\`\n\n` +
        `Скоро здесь появится Mini App для получения VPN!`
      );
    } else {
      await ctx.reply(
        `*С возвращением, ${username || 'студент'}!* 👋\n\n` +
        `✅ Ты уже в системе.`
      );
    }
  } catch (error) {
    console.error('Ошибка БД при обработке команды:', error);
    await ctx.reply('⚠️ Временно проблемы с базой данных. Попробуй позже.');
  }
});

bot.command('help', async (ctx) => {
  await ctx.reply('📚 *Помощь*\n\nСкоро здесь появится инструкция.');
});

// Корректное отключение при остановке бота
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// === СОЗДАНИЕ API СЕРВЕРА (HTTP) ===
const app = express();

app.use(express.json()); // Разбираем JSON тела запросов
app.use(cors());         // Разрешаем кросс-доменные запросы (для сайта/APK)

// Эндпоинт проверки здоровья
app.get('/health', (req, res) => {
    console.log('📡 GET /health вызван');
    res.status(200).json({ 
        status: 'OK', 
        service: 'NEURON VPN Backend',
        timestamp: new Date().toISOString()
    });
});

// Запускаем сервер на порту из переменных окружения (BotHost дает PORT автоматически)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 HTTP Server запущен на порту ${PORT}`);
});
// ================================

console.log('✅ Бот успешно запущен и слушает команды!');
bot.start().catch((err) => {
  console.error('❌ Ошибка запуска бота:', err);
});
