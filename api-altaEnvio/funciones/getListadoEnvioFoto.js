const { getConnection, getFromRedis, executeQuery } = require('../dbconfig');
const { logYellow, logBlue } = require('../fuctions/logsCustom');

async function getListadoEnvioFoto(connection, { fechaDesde, fechaHasta, pagina = 1, cantidad = 10, choferes }) {
  try {
    const hoy = new Date();
    const unaSemanaAntes = new Date(hoy);
    unaSemanaAntes.setDate(hoy.getDate() - 7);

    // Si no vienen las fechas, se asignan por defecto
    const desdeStr = (fechaDesde || unaSemanaAntes.toISOString().slice(0, 10)) + ' 00:00:00';
    const hastaStr = (fechaHasta || hoy.toISOString().slice(0, 10)) + ' 23:59:59';

    const offset = (pagina - 1) * cantidad;

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
        AND e.lote = 'envioFot'
        AND e.autoFecha BETWEEN ? AND ?
        ${choferFilter}
    `;
    const countParams = [desdeStr, hastaStr, ...choferesArray];
    const [countResult] = await executeQuery(connection, countQuery, countParams);
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
          AND e.autoFecha BETWEEN ? AND ?
          ${choferFilter}
      GROUP BY e.did
      ORDER BY e.did DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [desdeStr, hastaStr, ...choferesArray, cantidad, offset];
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

