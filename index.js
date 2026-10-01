const { execSync } = require('child_process');
const { Bot } = require('grammy');
require('dotenv').config();

// Генерируем Prisma Client при старте
try {
  console.log('🔄 Генерация Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma Client сгенерирован');
} catch (error) {
  console.error('❌ Ошибка генерации Prisma:', error.message);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  const telegramId = BigInt(ctx.from.id);
  const username = ctx.from.username;
  const fullName = ctx.from.first_name + ' ' + (ctx.from.last_name || '');
  
  try {
    let student = await prisma.student.findUnique({
      where: { telegramId }
    });
    
    if (!student) {
      student = await prisma.student.create({
        data: {
          telegramId,
          username,
          fullName
        }
      });
      
      await ctx.reply(
        `👋 *Привет, ${username || 'студент'}!*\n\n` +
        `Я тебя запомнил в базе данных.\n` +
        `Твой ID: \`${telegramId}\``
      );
    } else {
      await ctx.reply(
        `*С возвращением, ${username || 'студент'}!*\n\n` +
        `Ты уже в системе.`
      );
    }
  } catch (error) {
    console.error('Ошибка БД:', error);
    await ctx.reply('⚠️ Ошибка подключения к базе данных.');
  }
});

bot.command('help', async (ctx) => {
  await ctx.reply('📚 *Помощь*\n\nСкоро здесь появится инструкция.');
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

console.log('✅ NEURON VPN Bot запускается...');
bot.start().catch((err) => {
  console.error('❌ Ошибка запуска бота:', err);
});
