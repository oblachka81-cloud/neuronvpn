const { Bot } = require('grammy');
const prisma = require('./db');
require('dotenv').config();

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  const telegramId = BigInt(ctx.from.id);
  const username = ctx.from.username;
  const fullName = ctx.from.first_name + ' ' + (ctx.from.last_name || '');
  
  // Проверяем, есть ли студент в БД
  let student = await prisma.student.findUnique({
    where: { telegramId }
  });
  
  if (!student) {
    // Создаем нового студента
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
      `Скоро здесь появится возможность получить VPN доступ!\n\n` +
      `Твой ID: \`${telegramId}\``
    );
  } else {
    await ctx.reply(
      ` *С возвращением, ${username || 'студент'}!*\n\n` +
      `Ты уже в системе. Жди обновлений!`
    );
  }
});

bot.command('help', async (ctx) => {
  await ctx.reply('📚 *Помощь*\n\nСкоро здесь появится инструкция.');
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

console.log('✅ NEURON VPN Bot запускается с базой данных...');
bot.start().catch((err) => {
  console.error('❌ Ошибка запуска бота:', err);
});
