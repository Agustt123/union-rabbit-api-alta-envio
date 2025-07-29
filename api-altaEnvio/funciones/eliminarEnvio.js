const { getConnection, getFromRedis, executeQuery } = require('../dbconfig');
const { logYellow, logBlue } = require('../fuctions/logsCustom');

async function eliminarEnvio(connection, did) {
    try {
        const query = `UPDATE envios SET elim = 1 WHERE did = ?`;
        const result = await executeQuery(connection, query, [did]);
        return result;
    } catch (error) {
        throw error;
    }



}


module.exports = {
    eliminarEnvio
}
