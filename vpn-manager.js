const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Конфигурация из .env
const PANEL_CONFIG = {
    baseUrl: process.env.VPN_PANEL_URL, // https://ip:port
    basePath: process.env.VPN_BASE_PATH, // /path.../
    apiToken: process.env.VPN_API_TOKEN, // <=== ТОКЕН ИЗ ШАГА 1
    inboundId: parseInt(process.env.VPN_INBOUND_ID || '1', 10)
};

if (!PANEL_CONFIG.apiToken) {
    throw new Error('❌ [VPN Manager] Не задан VPN_API_TOKEN в .env!');
}

// Агент для игнорирования ошибок SSL (самоподписанный сертификат)
const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Создание клиента через API Token (без логина!)
 */
async function createClient(email, limitGB = 100, expiryDate) {
    const uuid = crypto.randomUUID();
    
    // Формируем данные клиента строго по формату 3x-ui
    // Важно: totalGB должен быть в БАЙТАХ
    const bytesLimit = limitGB * 1024 * 1024 * 1024; 
    const expiryMs = expiryDate.getTime(); 

    const clientData = {
        id: uuid,
        email: email,
        remark: `${email}`,
        enable: true,
        expiryTime: expiryMs,
        totalGB: bytesLimit,
        limitIp: 1,
        reset: 0,
        flow: "",
        tgId: "",
        subId: ""
    };

    try {
        console.log(`🔄 [VPN Manager] Создаю клиента ${email} через API Token...`);
        
        // Отправляем запрос сразу с заголовком Authorization
        const response = await axios.post(
            `${PANEL_CONFIG.baseUrl}${PANEL_CONFIG.basePath}panel/api/inbounds/addClient`,
            {
                id: PANEL_CONFIG.inboundId,
                settings: JSON.stringify({ clients: [clientData] })
            },
            {
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PANEL_CONFIG.apiToken}` // <=== МАГИЯ ЗДЕСЬ
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
