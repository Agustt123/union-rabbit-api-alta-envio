const { getConnection, getFromRedis, executeQuery } = require('../dbconfig');
const { logYellow, logBlue } = require('../fuctions/logsCustom');

async function getListadoEnvioFoto(connection, { fechaDesde, fechaHasta, pagina = 1, cantidad = 10, choferes }) {
  try {
    const offset = (pagina - 1) * cantidad;

    // Si viene string de choferes: "12,34,56"
    let choferesArray = [];
    let choferFilter = '';

    if (choferes) {
      choferesArray = choferes.split(',').map(id => parseInt(id.trim())).filter(Boolean);
      if (choferesArray.length > 0) {
        choferFilter = `AND e.choferAsignado IN (${choferesArray.map(() => '?').join(',')})`;
      }
    }

    const countQuery = `
            SELECT COUNT(DISTINCT e.did) AS total
            FROM envios AS e
            LEFT JOIN envios_direcciones_destino AS edd
                ON e.did = edd.didEnvio AND edd.elim = 0 AND edd.superado = 0
            WHERE e.elim = 69 
                AND e.lote = 'envioFoto'
                AND e.fechaCreacion BETWEEN ? AND ?
                ${choferFilter}
        `;
    const countParams = [fechaDesde, fechaHasta, ...choferesArray];
    const [countResult] = await connection.query(countQuery, countParams);
    const total = countResult.total;

    const dataQuery = `
            SELECT 
                e.did, 
                e.choferAsignado,
                su.usuario AS nombreChofer,
                CASE 
                    WHEN edd.address_line IS NOT NULL AND TRIM(edd.address_line) <> '' THEN 1 
                    ELSE 0 
                END AS tieneDireccion,
                ef.nombre AS nombreFoto
            FROM envios AS e
            LEFT JOIN envios_direcciones_destino AS edd
                ON e.did = edd.didEnvio AND edd.elim = 0 AND edd.superado = 0
            LEFT JOIN sistema_usuarios AS su
                ON su.did = e.choferAsignado AND su.elim = 0 AND su.superado = 0
            LEFT JOIN envios_fotos AS ef
                ON ef.didEnvio = e.did AND ef.elim = 0
            WHERE e.elim = 69 
                AND e.lote = 'envioFot'
                AND e.fechaCreacion BETWEEN ? AND ?
                ${choferFilter}
            GROUP BY e.did
            ORDER BY e.did DESC
            LIMIT ? OFFSET ?
        `;
    const dataParams = [fechaDesde, fechaHasta, ...choferesArray, cantidad, offset];
    const resultados = await executeQuery(connection, dataQuery, dataParams);

    return {
      total,
      pagina,
      cantidad,
      resultados
    };

  } catch (error) {
    throw error;
  }
}



module.exports = {
  getListadoEnvioFoto
}

