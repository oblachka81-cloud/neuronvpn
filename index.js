const { execSync } = require('child_process');
require('dotenv').config();

// === ИМПОРТЫ ДЛЯ СЕРВЕРА ===
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // <=== ДОБАВИЛИ JWT
// =================================

console.log('🚀 Запуск NEURON VPN...');

// ШАГ 1: Генерируем Prisma Client ПЕРЕД тем, как его импортировать
try {
  console.log('🔄 1. Генерация Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  
  console.log('🔄 2. Синхронизация схемы с базой данных (создание таблиц)...');
  // Добавили --accept-data-loss, чтобы Prisma принудительно применила изменения и удалила старые таблицы
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  
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

// Читаем секрет из .env. Если его нет — роняем сервер, чтобы не работать небезопасно
const JWT_SECRET = process.env.JWT_SECRET; 

if (!JWT_SECRET) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Переменная JWT_SECRET не найдена в .env!');
    process.exit(1);
}

// Эндпоинт проверки здоровья
app.get('/health', (req, res) => {
    console.log('📡 GET /health вызван');
    res.status(200).json({ 
        status: 'OK', 
        service: 'NEURON VPN Backend',
        timestamp: new Date().toISOString()
    });
});

// === ЭНДПОИНТ РЕГИСТРАЦИИ ПОЛЬЗОВАТЕЛЯ ===
app.post('/api/register', async (req, res) => {
    const { email, password, fullName } = req.body;

    // Простая проверка входных данных
    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        // Проверяем, нет ли уже такого пользователя
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        }

        // !!! ВАЖНО !!! В продакшене здесь должен быть bcrypt.hash(password, saltRounds)
        // Но для MVP/теста сохраним пароль как есть (НЕ ДЕЛАЙ ТАК НА РЕАЛЬНОМ ПРОЕКТЕ!)
        const hashedPassword = password; 

        // Создаем нового пользователя в базе
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                fullName: fullName || null
            }
        });

        console.log(`✅ Новый пользователь зарегистрирован: ${newUser.email}`);
        
        // Возвращаем ответ клиенту (без пароля!)
        res.status(201).json({ 
            message: 'Регистрация успешна', 
            user: { id: newUser.id, email: newUser.email } 
        });

    } catch (error) {
        console.error('❌ Ошибка при регистрации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
// ==========================================

// === ЭНДПОИНТ ЛОГИНА (НОВЫЙ) ===
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        // 1. Ищем пользователя по email
        const user = await prisma.user.findUnique({ where: { email } });
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // 2. Проверяем пароль 
        // (Пока сравниваем напрямую, так как мы не хэшировали при регистрации)
        if (user.password !== password) {
             return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // 3. Генерируем токен (срок жизни 7 дней)
        const token = jwt.sign(
            { userId: user.id, email: user.email }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

        console.log(`✅ Успешный логин: ${user.email}`);

        // 4. Возвращаем токен клиенту
        res.json({ 
            message: 'Вход выполнен успешно',
            token: token,
            user: { id: user.id, email: user.email }
        });

    } catch (error) {
        console.error('❌ Ошибка при логине:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// === ИМПОРТ МОДУЛЯ УПРАВЛЕНИЯ ПАНЕЛЬЮ ===
const vpnManager = require('./vpn-manager'); 
// =========================================

// Middleware для проверки JWT токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Формат "Bearer TOKEN"

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Токен невалиден или истек
        req.user = user; // Сохраняем данные юзера в запрос
        next();
    });
}

// === ЭНДПОИНТ ПОЛУЧЕНИЯ КОНФИГА VPN (ЗАЩИЩЕННЫЙ) ===
app.get('/api/get-vpn-config', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId; // ID пользователя из токена

        // 1. Проверяем, есть ли у него активная подписка в нашей базе
        let subscription = await prisma.subscription.findFirst({
            where: { userId: userId, isActive: true }
        });

        // Если подписки нет — создаем тестовую (для MVP). 
        // В реальном проекте здесь должна быть проверка оплаты!
        if (!subscription) {
            console.log(`⚠️ У юзера ${userId} нет подписки. Создаем временную...`);
            subscription = await prisma.subscription.create({
                data: {
                    userId: userId,
                    trafficLimit: 10n, // 10 ГБ (BigInt)
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 дней
                    isActive: true
                }
            });
        }

        // 2. Если в панели еще нет клиента для этой подписки — создаем его
        if (!subscription.panelClientId) {
            console.log(`🔄 Создаем клиента в панели 3x-ui для юзера ${userId}...`);
            
            // Вызываем наш модуль
            const result = await vpnManager.createClient(
                `user_${userId}`, // Email/Remark
                Number(subscription.trafficLimit), // Лимит ГБ
                subscription.expiresAt // Дата окончания
            );

            if (result.success) {
                // Обновляем запись в нашей базе, сохраняя UUID из панели
                await prisma.subscription.update({
                    where: { id: subscription.id },
                    data: { panelClientId: result.uuid }
                });
                
                console.log(`✅ Клиент создан в панели. UUID: ${result.uuid}`);
            } else {
                throw new Error('Не удалось создать клиента в панели');
            }
        }

        // 3. Формируем итоговую ссылку vless://... для отправки клиенту
        // Берем настройки из env, чтобы не хардкодить IP
        const hostPart = process.env.VPN_PANEL_URL.replace(/^https?:\/\//, '').split(':')[0];
        const finalLink = `vless://${subscription.panelClientId}@${hostPart}:443?security=tls&type=tcp&sni=${hostPart}&fp=randomized#NEURON_VPN_User_${userId}`;

        console.log(`🎉 Конфиг сгенерирован для юзера ${userId}`);

        res.json({
            status: 'success',
            config_link: finalLink,
            info: {
                traffic_limit_gb: Number(subscription.trafficLimit),
                expires_at: subscription.expiresAt.toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Ошибка при выдаче конфига:', error);
        res.status(500).json({ error: 'Ошибка генерации конфигурации VPN', details: error.message });
    }
});
// ====================================================


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
