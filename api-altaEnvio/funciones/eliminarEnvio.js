const { getConnection, getFromRedis, executeQuery } = require('../dbconfig');
const { logYellow, logBlue } = require('../fuctions/logsCustom');

async function eliminarEnvio(connection, did) {
    try {
        const query = `UPDATE envios SET elim = 1 WHERE did = ?`;
        const result = await executeQuery(connection, query, [did]);
        return { estado: true, message: 'El envio se ha eliminado correctamente' } || {
            estado: false,
            message: 'No se pudo eliminar el envio'
        };
    } catch (error) {
        throw error;
    }



}


module.exports = {
    eliminarEnvio
}
