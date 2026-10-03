const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Конфигурация из .env
const PANEL_CONFIG = {
    baseUrl: process.env.VPN_PANEL_URL, // https://ip:port
    basePath: process.env.VPN_BASE_PATH, // /path.../
    apiToken: process.env.VPN_API_TOKEN, // <=== ТОКЕН
    inboundId: parseInt(process.env.VPN_INBOUND_ID || '1', 10)
};

if (!PANEL_CONFIG.apiToken) {
    throw new Error('❌ [VPN Manager] Не задан VPN_API_TOKEN в .env!');
}

// Агент для игнорирования ошибок SSL (самоподписанный сертификат)
const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Создание клиента через НОВЫЙ API (v3.x)
 */
async function createClient(email, limitGB = 100, expiryDate) {
    const uuid = crypto.randomUUID();
    
    // Формируем объект клиента согласно схеме Client из документации
    // Важно: totalGB должен быть в БАЙТАХ
    const bytesLimit = limitGB * 1024 * 1024 * 1024; 
    const expirySecs = Math.floor(expiryDate.getTime() / 1000); // Unix timestamp в СЕКУНДАХ

    const clientPayload = {
        id: uuid,
        email: email,
        comment: `${email} | ${limitGB}GB`, // В новых версиях поле description часто называется comment или remark
        enable: true,
        expiryTime: expirySecs,
        totalGB: bytesLimit,
        limitIp: 1,
        reset: 0,
        flow: "",
        tgId: "",
        subId: ""
    };

    try {
        console.log(`🔄 [VPN Manager] Создаю клиента ${email} через POST /panel/api/clients/add...`);
        
        // Отправляем запрос на ПРАВИЛЬНЫЙ эндпоинт из документации
        const response = await axios.post(
            `${PANEL_CONFIG.baseUrl}${PANEL_CONFIG.basePath}panel/api/clients/add`,
            {
                client: clientPayload,       // Объект клиента
                inboundIds: [PANEL_CONFIG.inboundId] // Массив ID инбаундов, к которым подключаем клиента
            },
            {
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PANEL_CONFIG.apiToken}`
                },
                httpsAgent: agent
            }
        );

        if (response.data.success) {
            console.log(`✅ [VPN Manager] Клиент создан успешно.`);
            
            // Генерируем ссылку VLESS
            const hostPart = PANEL_CONFIG.baseUrl.replace(/^https?:\/\//, '').split(':')[0];
            const portPart = PANEL_CONFIG.baseUrl.split(':').pop(); 
            
            const link = `vless://${uuid}@${hostPart}:${portPart}?security=tls&type=tcp&sni=${hostPart}&fp=randomized#${encodeURIComponent(email)}`;
            
            return { success: true, uuid, link };
        } else {
             throw new Error(response.data.msg || 'Неизвестная ошибка панели');
        }
    } catch (error) {
         console.error('❌ [VPN Manager] Ошибка создания:', error.response?.data || error.message);
         throw error;
    }
}

module.exports = { createClient };
