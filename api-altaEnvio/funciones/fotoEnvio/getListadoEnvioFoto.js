const { getConnection, getFromRedis, executeQuery } = require('../../dbconfig');
const { logYellow, logBlue } = require('../../fuctions/logsCustom');

// Agrega el parámetro opcional `direccion` (string) para filtrar por texto en la dirección
// Busca en edd.address_line (o edd.addres_line) y también en la concatenación calle/numero/localidad

async function getListadoEnvioFoto(
  connection,
  { fechaDesde, fechaHasta, pagina = 1, cantidad = 10, choferes, direccion } // <-- nuevo
) {
  try {
    const hoy = new Date();
    cantidad = parseInt(cantidad);
    pagina = parseInt(pagina);

    const unaSemanaAntes = new Date(hoy);
    unaSemanaAntes.setDate(hoy.getDate() - 7);

    const desdeStr = (fechaDesde || unaSemanaAntes.toISOString().slice(0, 10)) + ' 00:00:00';
    const hastaStr = (fechaHasta || hoy.toISOString().slice(0, 10)) + ' 23:59:59';

    const offset = (pagina - 1) * cantidad;

    // ---- Filtro choferes
    let choferesArray = [];
    let choferFilter = '';
    if (choferes) {
      choferesArray = choferes
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(Boolean);
      if (choferesArray.length > 0) {
        choferFilter = `AND e.choferAsignado IN (${choferesArray.map(() => '?').join(',')})`;
      }
    }

    // ---- Filtro dirección (texto libre, separa por espacios y exige que estén todos los términos)
    // Normalizamos la dirección en SQL: preferimos address_line / addres_line y si no, concatenamos calle/numero/localidad
    // Usamos COLLATE utf8mb4_general_ci para que sea case-insensitive y (usualmente) accent-insensitive
    let direccionFilter = '';
    let direccionParams = [];

    if (typeof direccion === 'string' && direccion.trim() !== '') {
      const terms = direccion
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (terms.length > 0) {
        // expresión base: solo address_line
        const ADDR_EXPR = `edd.address_line `;

        direccionFilter =
          'AND ' +
          terms
            .map(() => `(${ADDR_EXPR} LIKE ?)`)
            .join(' AND ');

        direccionParams = terms.map(t => `%${t}%`);
      }
    }


    // ---- COUNT
    const countQuery = `
      SELECT COUNT(DISTINCT e.did) AS total
      FROM envios AS e
      LEFT JOIN envios_direcciones_destino AS edd
        ON e.did = edd.didEnvio AND edd.elim = 0 AND edd.superado = 0
      WHERE e.elim = 69
        AND e.superado = 0
        AND e.lote = 'envioFot'
        AND e.autoFecha BETWEEN ? AND ?
        ${choferFilter}
        ${direccionFilter}
    `;
    const countParams = [desdeStr, hastaStr, ...choferesArray, ...direccionParams];
    const [countResult] = await executeQuery(connection, countQuery, countParams);
    const registros = countResult.total;

    // ---- DATA
    const dataQuery = `
   SELECT
  e.did,
  e.choferAsignado,
  CONCAT(su.nombre, ' ', su.apellido) AS nombreChofer,
  edd.calle,
  edd.numero,
  edd.localidad,
  edd.address_line AS address_line,   -- ✅
  DATE_SUB(ef.autofecha, INTERVAL 3 HOUR) AS fechaFoto,
  ef.nombre AS nombreFoto,
  (CASE
    WHEN (edd.calle IS NOT NULL AND edd.calle <> '')
      OR (edd.numero IS NOT NULL AND edd.numero <> '')
      OR (edd.localidad IS NOT NULL AND edd.localidad <> '')
      OR (edd.address_line IS NOT NULL AND edd.address_line <> '')  -- ✅
    THEN 1 ELSE 0
  END) AS direccion
FROM envios AS e
LEFT JOIN envios_direcciones_destino AS edd
  ON e.did = edd.didEnvio AND edd.elim = 0 AND edd.superado = 0
LEFT JOIN sistema_usuarios AS su
  ON su.did = e.choferAsignado AND su.elim = 0 AND su.superado = 0
LEFT JOIN envios_fotos AS ef
  ON ef.didEnvio = e.did AND ef.elim = 69
WHERE e.elim = 69
  AND e.superado = 0
  AND e.lote = 'envioFot'
  AND e.autoFecha BETWEEN ? AND ?
  ${choferFilter}
  ${direccionFilter}   -- cuando filtras por texto
GROUP BY e.did
ORDER BY e.did DESC
LIMIT ? OFFSET ?;

    `;
    const dataParams = [desdeStr, hastaStr, ...choferesArray, ...direccionParams, cantidad, offset];
    const data = await executeQuery(connection, dataQuery, dataParams);

    // Puedes mantener este flag si lo usás en front
    const direcciones = data.some(row => row.direccion === 1);

    return {
      estado: true,
      registros,
      pagina,
      totalPaginas: Math.ceil(registros / cantidad),
      cantidad,
      data,
    };

  } catch (error) {
    throw error;
  }
}



module.exports = {
  getListadoEnvioFoto
}

