const axios = require('axios');
const crypto = require('crypto');
const { logRed, logGreen } = require('./logsCustom.js');

// 👉 Endpoint al que querés pegarle SIEMPRE
const API_ENDPOINT = "https://serverestado.lightdata.app/estados";

// ---------------- UTILIDADES ----------------

// Fecha formateada a UTC-3
function getFechaUTC3() {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3);
    return fecha.toISOString();
}

// Token SHA256 basado en la fecha (ddmmaaaa)
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

// ---------------- FUNCIÓN PRINCIPAL ----------------

async function sendToShipmentStateMicroServiceAPI(companyId, userId, shipmentId, estado) {

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
}

module.exports = sendToShipmentStateMicroServiceAPI;
