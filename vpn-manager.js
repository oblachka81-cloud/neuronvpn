const axios = require('axios');
const https = require('https');
const crypto = require('crypto'); // <=== КРИТИЧЕСКИ ВАЖНО
require('dotenv').config();

// Конфигурация из .env
const PANEL_CONFIG = {
    baseUrl: (process.env.VPN_PANEL_URL || '').replace(/\/$/, ''),
    basePath: (process.env.VPN_BASE_PATH || '').replace(/^\/|\/$/g, ''),
    apiToken: process.env.VPN_API_TOKEN,
    inboundId: parseInt(process.env.VPN_INBOUND_ID || '2', 10), // Дефолт теперь 2
    
    // Параметры REALITY для формирования ссылки
    publicKey: process.env.REALITY_PUBLIC_KEY,
    shortId: process.env.REALITY_SHORT_ID,
    sni: process.env.REALITY_SNI,
    fingerprint: process.env.REALITY_FINGERPRINT || 'chrome',
    spiderX: process.env.REALITY_SPIDER_X || ''
};

if (!PANEL_CONFIG.apiToken) {
    throw new Error('❌ [VPN Manager] Не задан VPN_API_TOKEN в .env!');
}
if (!PANEL_CONFIG.publicKey) {
    throw new Error('❌ [VPN Manager] Не задан REALITY_PUBLIC_KEY в .env! Без него ссылка не сработает.');
}

// Агент для игнорирования ошибок SSL (самоподписанный сертификат панели)
const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Вспомогательная функция для безопасной сборки URL API
 */
function getApiUrl(path) {
    const bp = PANEL_CONFIG.basePath ? `/${PANEL_CONFIG.basePath}` : '';
    return `${PANEL_CONFIG.baseUrl}${bp}${path}`;
}

async function createClient(email, limitGB = 100, expiryDate) {
    const uuid = crypto.randomUUID();
    
    // totalGB в байтах
    const bytesLimit = Math.floor(limitGB * 1024 * 1024 * 1024);
    // expiryTime в миллисекундах (для совместимости с текущей логикой бота)
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
            flow: "", // Поток задается на уровне инбаунда или в ссылке, здесь оставляем пусто/дефолт
            tgId: 0,  // ЧИСЛО, а не строка!
            subId: "",
            comment: `NEURON ${email}`,
            reset: 0
        },
        inboundIds: [PANEL_CONFIG.inboundId] // Используем ID=2
    };

    const url = getApiUrl('/panel/api/clients/add');
    console.log(`🔗 [VPN Manager] Создаю клиента через: ${url}`);

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
            console.log(`✅ [VPN Manager] Клиент успешно создан в панели.`);

            // --- ГЕНЕРАЦИЯ ССЫЛКИ VLESS + REALITY ---
            const hostPart = PANEL_CONFIG.baseUrl.replace(/^https?:\/\//, '').split(':')[0];
            
            let params = [];
            params.push(`security=reality`);
            params.push(`pbk=${PANEL_CONFIG.publicKey}`);       // Публичный ключ
            params.push(`sid=${PANEL_CONFIG.shortId}`);         // Short ID
            params.push(`sni=${PANEL_CONFIG.sni}`);             // SNI (acs.aliexpress.com)
            params.push(`fp=${PANEL_CONFIG.fingerprint}`);      // Отпечаток браузера (chrome)
            if (PANEL_CONFIG.spiderX) {
                params.push(`px=${encodeURIComponent(PANEL_CONFIG.spiderX)}`); // Spider X
            }
            params.push(`type=tcp`);                            // Транспорт
            params.push(`flow=xtls-rprx-vision`);               // Обязательный поток для Vision
            
            const queryString = params.join('&');
            // Порт всегда 443, так как мы его жестко задали при создании инбаунда
            const link = `vless://${uuid}@${hostPart}:443?${queryString}#${encodeURIComponent(email)}`;

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
