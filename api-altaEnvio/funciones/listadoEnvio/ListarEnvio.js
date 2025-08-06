const { executeQuery } = require("../../dbconfig");

async function ListarEnvio(connection, didEmpresa) {

    try {
        const query = `SELECT e.did,e.codigo,e.didCliente,e.choferAsignado,e.estado_envio, e.est  FROM envios  e
        
        LEFT JOIN envios_direccionesDestino ed ON e.did = ed.didEnvio AND ed.elim = 0 AND ed.superado = 0
        LEFT JOIN envios_historial eo ON e.did = eo.didEnvio AND eo.elim = 0 AND eo.superado = 0
        LEFT JOIN sistema_usuarios su ON e.choferAsignado = su.did AND su.elim = 0 AND su.superado = 0
        
        WHERE e.elim = 0 e.superado = 0 ORDER BY id DESC`;


        const results = await executeQuery(connection, query, [didEmpresa]);
        return { estado: true, data: results };
    } catch (error) {
        throw error;
    }
}