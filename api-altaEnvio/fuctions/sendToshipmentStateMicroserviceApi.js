// sendToShipmentStateMicroServiceAPI.js
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

const axios = require('axios');
const crypto = require('crypto');
const { logCyan, logGreen, logRed, logYellow } = require('./logsCustom.js');


const sendToShipmentStateMicroService = require('./sendToshipmentStateMicroservice.js');

// RabbitMQ (2do paso)
let connect;
try { ({ connect } = require('amqplib')); } catch { }

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672";
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS || "srvshipmltosrvstates";

// Endpoint principal (1er paso)
const BACKUP_ENDPOINT = process.env.BACKUP_ENDPOINT || "http://10.70.0.69:13000/estados";

/** ISO ajustada a UTC-3 */
function formatFechaUTC3() {
    const d = new Date();
    d.setHours(d.getHours() - 3);
    return d.toISOString();
}

/** SHA-256 de ddmmyyyy en UTC-3 */
function generarTokenFechaHoy() {
    const ahora = new Date();
    ahora.setHours(ahora.getHours() - 3);
    const dd = String(ahora.getDate()).padStart(2, '0');
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const yyyy = ahora.getFullYear();
    return crypto.createHash('sha256').update(`${dd}${mm}${yyyy}`).digest('hex');
}

/** Paso 2: envío por MQ */
async function sendByRabbitMQ(message) {
    if (!connect || !RABBITMQ_URL) {
        throw new Error('RabbitMQ no disponible (amqplib o URL)');
    }
    const conn = await connect(RABBITMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertQueue(QUEUE_ESTADOS, { durable: true });

    const ok = ch.sendToQueue(QUEUE_ESTADOS, Buffer.from(JSON.stringify(message)), { persistent: true });
    if (!ok) throw new Error('Buffer lleno en RabbitMQ');

    await ch.close();
    await conn.close();
}


async function sendToShipmentStateMicroServiceAPI(
    companyId,
    quien,
    shipmentId,
    latitud = null,
    longitud = null
) {
    const message = {
        didempresa: companyId,
        didenvio: shipmentId,
        estado: 7,
        subestado: null,
        estadoML: null,
        fecha: formatFechaUTC3(),
        quien,
        operacion: 'colecta',
        latitud,
        longitud,
        desde: 'colectaAPP',
        tkn: generarTokenFechaHoy(),
    };

    // Paso 1: HTTP
    logCyan(`HTTP -> ${BACKUP_ENDPOINT} :: ${JSON.stringify(message)}`);
    try {
        const res = await axios.post(BACKUP_ENDPOINT, message, { timeout: 15000 });
        logGreen(`✅ HTTP OK (${res.status})`);
        return { via: 'http', status: res.status, data: res.data };
    } catch (eHttp) {
        logRed(`❌ HTTP falló: ${eHttp.message}`);
    }

    // Paso 2: MQ
    try {
        logYellow('↩️ Fallback a RabbitMQ…');
        await sendByRabbitMQ(message);
        logGreen('✅ MQ OK');
        return { via: 'rabbitmq', status: 202 };
    } catch (eMq) {
        logRed(`❌ MQ falló: ${eMq.message}`);
    }

    // Paso 3: primer módulo (tu función original)
    try {
        logYellow('↩️ Último intento: primer módulo (original)…');
        // Tu primer módulo espera: (companyId, userId, shipmentId, estado)
        await sendToShipmentStateMicroService(companyId, quien, shipmentId, 7);
        logGreen('✅ Primer módulo OK');
        return { via: 'first-module', status: 202 };
    } catch (eFirst) {
        logRed(`❌ Falló todo: ${eFirst.message}`);
        throw eFirst;
    }
}

module.exports = {
    sendToShipmentStateMicroServiceAPI,
    formatFechaUTC3,
    generarTokenFechaHoy,
};
