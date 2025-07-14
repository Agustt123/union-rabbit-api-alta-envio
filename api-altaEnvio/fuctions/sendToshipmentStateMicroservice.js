const { connect } = require('amqplib');
const axios = require('axios');
const { logRed, logGreen, logYellow } = require('./logsCustom.js');

const RABBITMQ_URL = "amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672";
const QUEUE_ESTADOS = "srvshipmltosrvstates";
const BACKUP_ENDPOINT = "https://serverestado.lightdata.app/estados";

function getFechaUTC3() {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajuste a UTC-3
    return fecha.toISOString();
}
const crypto = require('crypto');

// Función que genera el hash SHA-256 de la fecha actual
function generarTokenFechaHoy() {
    const ahora = new Date();
    ahora.setHours(ahora.getHours() - 3); // Resta 3 horas

    console.log("📆 Fecha ajustada (UTC-3):", ahora);

    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const anio = ahora.getFullYear();

    const fechaString = `${dia}${mes}${anio}`; // Ej: "11072025"
    const hash = crypto.createHash('sha256').update(fechaString).digest('hex');

    return hash;
}

async function sendToShipmentStateMicroService(companyId, userId, shipmentId, estado) {
    const message = {
        didempresa: companyId,
        didenvio: shipmentId,
        tkn: generarTokenFechaHoy(),
        estado: estado,
        subestado: null,
        estadoML: null,
        fecha: getFechaUTC3(),
        quien: userId,
        operacion: "Altamasiva"
    };
    console.log(message, "mensajeeeeeeeeeeeeeeeeeeeee");


    try {
        const connection = await connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        const sent = channel.sendToQueue(
            QUEUE_ESTADOS,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );

        if (sent) {
            logGreen('✅ Mensaje enviado correctamente al microservicio de estados');
        } else {
            logYellow('⚠️ Mensaje no pudo encolarse (buffer lleno)');
            throw new Error('Buffer lleno en RabbitMQ');
        }

        await channel.close();
        await connection.close();
    } catch (error) {
        logRed(`❌ Falló RabbitMQ, intentando enviar por HTTP: ${error.message}`);

        try {
            const response = await axios.post(BACKUP_ENDPOINT, message);
            logGreen(`✅ Enviado por HTTP con status ${response.status}`);
        } catch (httpError) {
            logRed(`❌ Falló el envío por HTTP también: ${httpError.message}`);
            throw httpError;
        }
    }
}

module.exports = sendToShipmentStateMicroService;
