const axios = require('axios');
const crypto = require('crypto');
const { logRed, logGreen } = require('./logsCustom.js');
const { executeQuery, microservicioEstadosService } = require('../dbconfig.js');
const { MicroservicioEstadosService } = require('./microservicio_estado.js');
const sendToShipmentStateMicroService = require('./sendToshipmentStateMicroservice.js');

const API_ENDPOINT = "https://serverestado.lightdata.app/estados";

// ---------------- UTILIDADES ----------------

// Fecha formateada a UTC-3
function getFechaUTC3() {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3);
    return fecha.toISOString();
}


function generarTokenFechaHoy() {
    const ahora = new Date();
    ahora.setHours(ahora.getHours() - 3);

    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const anio = ahora.getFullYear();

    const fechaString = `${dia}${mes}${anio}`;
    const hash = crypto.createHash('sha256').update(fechaString).digest('hex');

    return hash;
}


/*async function sendToShipmentStateMicroServiceAPI(companyId, userId, shipmentId, estado) {

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

    console.log("📨 Enviando payload:", message);

    try {
        const response = await axios.post(API_ENDPOINT, message);

        logGreen(`✅ Enviado correctamente al microservicio. Status: ${response.status}`);

        return response.data;

    } catch (error) {
        logRed(`❌ Error al enviar al microservicio: ${error.message}`);

        if (error.response) {
            console.error("📌 Response del backend:", error.response.data);
        }

        throw error;
    }
}*/
async function sendToShipmentStateMicroServiceAPI(
    companyId,
    userId,
    shipmentId,
    estado,
    db,
    latitud = null,
    longitud = null,
) {
    const message = {
        didempresa: companyId,
        didenvio: shipmentId,
        estado: estado,
        subestado: null,
        estadoML: null,
        fecha: getFechaUTC3(),
        quien: userId,
        operacion: 'ALTAAPIENVIO',
        latitud,
        longitud,
        desde: "Altamasiva",
        tkn: generarTokenFechaHoy(),
    };


    if (microservicioEstadosService.estaCaido()) {
        await actualizarEstadoLocal(db, [shipmentId], "ALTAENVIO", getFechaUTC3(), userId, estado);

        await sendToShipmentStateMicroService(companyId, userId, shipmentId, estado);
    }
    else {
        try {
            await microservicioEstadosService.sendEstadoAPI(message);
        } catch (error) {
            logRed(`Error enviando a Shipment State MicroService API: ${error.message}`);
            microservicioEstadosService.setEstadoCaido();
            await actualizarEstadoLocal(db, [shipmentId], "mlia", getFechaUTC3(), userId, 7);
            await sendToShipmentStateMicroService(companyId, userId, shipmentId, estado);

        }
    }
}

async function actualizarEstadoLocal(db, shipmentIds, deviceFrom, dateConHora, userId, state) {
    const query1 = `
            UPDATE envios_historial
            SET superado = 1
            WHERE superado = 0 AND didEnvio IN(${shipmentIds.join(',')})
        `;
    await executeQuery(db, query1);

    const query2 = `
            UPDATE envios
            SET estado_envio = ?
            WHERE superado = 0 AND did IN(${shipmentIds.join(',')})
        `;
    await executeQuery(db, query2, [state]);

    const query3 = `
            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete, desde)
            SELECT did, ?, ?, ?, choferAsignado, ?
            FROM envios WHERE did IN(${shipmentIds.join(',')})
        `;
    await executeQuery(db, query3, [state, userId, dateConHora, deviceFrom]);
}
module.exports = { sendToShipmentStateMicroServiceAPI, getFechaUTC3, generarTokenFechaHoy };
