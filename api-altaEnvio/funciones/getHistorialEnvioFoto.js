const { getConnection, getFromRedis, executeQuery } = require('../dbconfig');
const { logYellow, logBlue } = require('../fuctions/logsCustom');

async function getHIstorialEnvioFoto(connection) {

    try {

        const query = ` SELECT * FROM envios_historial
    LEFT JOIN envios 
    ON envios.did = envios_historial.didEnvio
    WHERE envios.elim = 69 AND envios.lote = 'envioFoto''
        `;
        const result = await connection.query(query);
        return result;

    } catch (error) {
        throw error;
    }



}


module.exports = {
    getHIstorialEnvioFoto
}

