const { Bot } = require('grammy');
const prisma = require('./db'); // <-- Импортируем твой db.js
require('dotenv').config();

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
        `✅ Я тебя запомнил в базе.\n` +
        `📱 Твой ID: \`${telegramId}\``
      );
    } else {
      await ctx.reply(
        `*С возвращением!* 👋\n\n` +
        `✅ Ты уже в системе.`
      );
    }
  } catch (error) {
    console.error('Ошибка БД:', error);
    await ctx.reply('⚠️ Ошибка подключения к БД.');
  }
});

bot.command('help', async (ctx) => {
  await ctx.reply('📚 *Помощь*\n\nСкоро инструкция.');
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

console.log('✅ NEURON VPN Bot запускается...');
bot.start().catch((err) => {
  console.error('❌ Ошибка:', err);
});
