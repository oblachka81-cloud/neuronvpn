const { Bot } = require('grammy');

// BotHost автоматически подставит BOT_TOKEN из своей панели!
// Но если ты запускаешь локально, dotenv поможет прочитать .env
require('dotenv').config();

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  await ctx.reply(
    '🚀 *NEURON VPN*\n\n' +
    'Добро пожаловать! Я твой персональный VPN менеджер.\n' +
    'Сейчас мы настраиваем инфраструктуру. Скоро здесь появится Mini App!\n\n' +
    'Используй /help для справки.'
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply('📚 *Помощь*\n\nСкоро здесь появится инструкция.');
});

console.log('✅ NEURON VPN Bot запускается...');
bot.start().catch((err) => {
  console.error('❌ Ошибка запуска бота:', err);
});
