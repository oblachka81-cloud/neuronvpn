const axios = require('axios');
const https = require('https');
const crypto = require('crypto'); // <=== ОБЯЗАТЕЛЬНО ИМПОРТИРУЕМ CRYPTO
require('dotenv').config();

// Конфигурация из .env
const PANEL_CONFIG = {
    baseUrl: (process.env.VPN_PANEL_URL || '').replace(/\/$/, ''), // Убираем хвостовой слэш
    basePath: (process.env.VPN_BASE_PATH || '').replace(/^\/|\/$/g, ''), // Убираем ведущий/хвостовой слэш для контроля
    apiToken: process.env.VPN_API_TOKEN,
    inboundId: parseInt(process.env.VPN_INBOUND_ID || '1', 10)
};

if (!PANEL_CONFIG.apiToken) {
    throw new Error('❌ [VPN Manager] Не задан VPN_API_TOKEN в .env!');
}

// Агент для игнорирования ошибок SSL
const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Вспомогательная функция для безопасной сборки URL
 */
function getApiUrl(path) {
    const bp = PANEL_CONFIG.basePath ? `/${PANEL_CONFIG.basePath}` : '';
    return `${PANEL_CONFIG.baseUrl}${bp}${path}`;
}

async function createClient(email, limitGB = 100, expiryDate) {
    const uuid = crypto.randomUUID();
    
    // totalGB в байтах
    const bytesLimit = Math.floor(limitGB * 1024 * 1024 * 1024);
    // expiryTime в миллисекундах (как требует новая версия API часто) или секундах
    // Студент использовал getTime(), оставим так, если панель ругнется - переключим на /1000
    const expiryMs = expiryDate instanceof Date ? expiryDate.getTime() : 0;

    // Payload строго по документации v3.x (/clients/add)
    const payload = {
        client: {
            id: uuid,
            email: email,
            enable: true,
            expiryTime: expiryMs, 
            totalGB: bytesLimit,
            limitIp: 1,
            flow: "",
            tgId: 0,
            subId: "",
            comment: `NEURON ${email}`,
            reset: 0
        },
        inboundIds: [PANEL_CONFIG.inboundId]
    };

    // Правильная сборка адреса: https://ip:port/path/panel/api/clients/add
    const url = getApiUrl('/panel/api/clients/add');
    console.log(`🔗 [VPN Manager] Создаю клиента: ${url}`);

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PANEL_CONFIG.apiToken}`
            },
            httpsAgent: agent,
            timeout: 15000
        });

        if (response.data?.success) {
            console.log(`✅ [VPN Manager] Клиент создан: ${email}`);

            // ВАЖНО: Порт в ссылке должен быть портом INBOUND (обычно 443), а не панели (38215)!
            // Если ты создавал входящий (Inbound) на другом порту, замени 443 на свой.
            const hostPart = PANEL_CONFIG.baseUrl.replace(/^https?:\/\//, '').split(':')[0];
            
            // Формируем ссылку VLESS
            const link = `vless://${uuid}@${hostPart}:443?security=tls&type=tcp&sni=${hostPart}&fp=randomized#${encodeURIComponent(email)}`;

            return { success: true, uuid, link };
        } else {
            throw new Error(response.data?.msg || 'Неизвестная ошибка панели');
        }
    } catch (error) {
        console.error('❌ [VPN Manager] Ошибка создания:', error.response?.status, error.response?.data || error.message);
        throw error;
    }
}

module.exports = { createClient };
