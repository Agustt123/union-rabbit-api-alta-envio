const { executeQuery } = require('../dbconfig');

async function getEnvioFotoByDid(connection, did) {
    try {
        const query = `
            SELECT 
                e.did,
                e.lote,
                e.choferAsignado,
                e.fecha_inicio,
                su.nombre AS nombreChofer,
                edd.localidad,
                edd.calle,
                edd.numero,
                edd.address_line,
                ef.nombre AS nombreFoto
            FROM envios AS e
            LEFT JOIN envios_direcciones_destino AS edd
                ON edd.didEnvio = e.did AND edd.elim = 0 AND edd.superado = 0
            LEFT JOIN envios_fotos AS ef
                ON ef.didEnvio = e.did AND ef.elim = 69
            LEFT JOIN sistema_usuarios AS su
                ON su.did = e.choferAsignado AND su.elim = 0 AND su.superado = 0
            WHERE e.did = ?
            LIMIT 1
        `;
        const [result] = await executeQuery(connection, query, [did]);
        return { estado: true, data: result } || { estado: false, data: null };
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getEnvioFotoByDid
};
