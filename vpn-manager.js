// vpn-manager.js
const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Конфигурация из переменных окружения (.env на BotHost)
const PANEL_CONFIG = {
    baseUrl: process.env.VPN_PANEL_URL,
    basePath: process.env.VPN_BASE_PATH,
    username: process.env.VPN_USERNAME,
    password: process.env.VPN_PASSWORD,
    inboundId: parseInt(process.env.VPN_INBOUND_ID || '1', 10)
};

// Проверка наличия всех необходимых переменных
if (!PANEL_CONFIG.baseUrl || !PANEL_CONFIG.username || !PANEL_CONFIG.password) {
    throw new Error('❌ [VPN Manager] Не хватает переменных VPN_* в .env');
}

// Агент для игнорирования ошибок SSL (сертификат Let's Encrypt для IP может быть неполным)
const agent = new https.Agent({ rejectUnauthorized: false });

let sessionCookie = null; // Храним куки авторизации между запросами

/**
 * Авторизация в панели 3x-ui
 */
async function login() {
    // Правильно склеиваем базовый URL и путь логина
    // Используем new URL(), чтобы браузер/Node сам разобрал адреса без ошибок
    const loginUrl = new URL(`${PANEL_CONFIG.basePath}/login`, PANEL_CONFIG.baseUrl).toString();
    
    console.log(`🔗 [VPN Manager] Пытаюсь войти по адресу: ${loginUrl}`); // <=== ЛОГИРУЕМ АДРЕС ДЛЯ ПРОВЕРКИ

    try {
        const response = await axios.post(loginUrl, 
            new URLSearchParams({
                username: PANEL_CONFIG.username,
                password: PANEL_CONFIG.password
            }),
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                httpsAgent: agent // Даже для http:// этот агент просто проигнорирует проверку, не сломает код
            }
        );

        if (response.data.success && response.headers['set-cookie']) {
            sessionCookie = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            console.log('✅ [VPN Manager] Вход выполнен успешно');
            return true;
        } else {
            throw new Error(response.data.msg || 'Неизвестная ошибка авторизации');
        }
    } catch (error) {
        // Логируем полную ошибку, включая стектрейс, если нужно
        console.error('❌ [VPN Manager] Детальная ошибка входа:', error.message);
        if(error.config) console.error('URL был:', error.config.url);
        sessionCookie = null;
        return false;
    }
}

/**
 * Создание нового клиента в панели 3x-ui
 * @param {string} email - Email или идентификатор пользователя
 * @param {number} limitGB - Лимит трафика в ГБ
 * @param {Date} expiryDate - Дата окончания подписки
 * @returns {Promise<{success: boolean, uuid: string, link: string}>}
 */
async function createClient(email, limitGB = 100, expiryDate) {
    // Если нет активной сессии — логинимся заново
    if (!sessionCookie) {
        const loggedIn = await login();
        if (!loggedIn) throw new Error('Не удалось войти в панель для создания клиента');
    }

    const uuid = crypto.randomUUID(); // Генерируем уникальный ID для VLESS/VMess
    
    const payload = {
        id: uuid,
        remark: `${email} | ${limitGB}GB`,
        enable: true,
        expiryTime: Math.floor(expiryDate.getTime() / 1000), // Unix timestamp в секундах
        totalGB: limitGB,
        limitIp: 1, // Одно устройство одновременно
        reset: 0
    };

    try {
        const response = await axios.post(
            `${PANEL_CONFIG.baseUrl}${PANEL_CONFIG.basePath}/panel/api/inbounds/addClient/${PANEL_CONFIG.inboundId}`,
            payload,
            {
                headers: { Cookie: sessionCookie },
                httpsAgent: agent
            }
        );

        if (response.data.success) {
            console.log(`✅ [VPN Manager] Клиент создан в панели: ${email}`);
            
            // Формируем ссылку vless://...
            // Примечание: Порт 443 и security=tls предполагают стандартные настройки инбаунда.
            // Если у тебя другой порт или протокол — нужно будет скорректировать эту строку.
            const hostPart = PANEL_CONFIG.baseUrl.replace(/^https?:\/\//, '').split(':')[0];
            const link = `vless://${uuid}@${hostPart}:443?security=tls&type=tcp&sni=${hostPart}&pbk=&fp=randomized#${encodeURIComponent(email)}`;
            
            return { success: true, uuid, link };
        } else {
            throw new Error(response.data.msg);
        }
    } catch (error) {
        console.error('❌ [VPN Manager] Ошибка создания клиента:', error.response?.data || error.message);
        // При ошибке сбрасываем cookie, чтобы следующая попытка залогинилась заново
        sessionCookie = null;
        throw error;
    }
}

module.exports = { login, createClient };
