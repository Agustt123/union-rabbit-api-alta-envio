const { connect } = require('amqplib');
const axios = require('axios');
const { logRed, logGreen, logYellow } = require('./logsCustom.js');
const { formatFechaUTC3 } = require('./formatFechaUTC3.js');

const RABBITMQ_URL = "amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672";
const QUEUE_ESTADOS = "srvshipmltosrvstates";
const BACKUP_ENDPOINT = "https://serverestado.lightdata.app/estados";

async function sendToShipmentStateMicroService(companyId, userId, shipmentId, estado) {
    if (companyId === 97) {
        estado = 7;
    }

    const message = {
        didempresa: companyId,
        didenvio: shipmentId,
        estado: estado,
        subestado: null,
        estadoML: null,
        fecha: formatFechaUTC3(),
        quien: userId,
        operacion: "Altamasiva"
    };

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
