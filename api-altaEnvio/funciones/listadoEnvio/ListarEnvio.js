const { executeQuery } = require("../../dbconfig");

function formatDatetimeStart(dateStr) {
    return `${dateStr} 00:00:00`;
}

function formatDatetimeEnd(dateStr) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1); // suma 1 día
    return `${date.toISOString().split('T')[0]} 00:00:00`;
}

function formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

async function ListarEnvio(connection, data = {}, pagina = 1, cantidad = 10) {
    try {
        const condiciones = [
            `e.elim = 0`,
            `e.superado = 0`,
            `e.estado_envio in (0,1,2,3,7,6,13,10,11,12)`
        ];
        const params = [];

        // Fechas por defecto: últimos 14 días
        const hoy = new Date();
        const hace14Dias = new Date();
        hace14Dias.setDate(hoy.getDate() - 14);

        const fechaDesde = data.fechaDesde || formatDate(hace14Dias);
        const fechaHasta = data.fechaHasta || formatDate(hoy);

        const fechaDesdeSQL = formatDatetimeStart(fechaDesde);
        const fechaHastaSQL = formatDatetimeEnd(fechaHasta);

        if (data.fecha == "venta") {
            condiciones.push(`e.fecha_venta >= ? AND e.fecha_venta < ?`);
        }
        if (data.fecha == "colecta") {
            condiciones.push(`eh.fecha >= ? AND eh.fecha < ? AND eh.elim = 0 AND eh.estado = 0`);
        }
        if (data.fecha == "aplanta") {
            condiciones.push(`eh.fecha >= ? AND eh.fecha < ? AND eh.elim = 0 AND eh.estado = 1`);
        }
        if (data.fecha == "cancelado") {
            condiciones.push(`eh.fecha >= ? AND eh.fecha < ? AND eh.elim = 0 AND eh.estado = 8`);
        }
        if (data.fecha == "entregado") {
            condiciones.push(`eh.fecha >= ? AND eh.fecha < ? AND eh.elim = 0 AND eh.estado = 5`);
        }
        if (data.fecha == "asignacion") {
            condiciones.push(`ea.autofecha >= ? AND ea.autofecha < ? AND ea.elim = 0 AND ea.superado = 0`);
        }

        else {
            condiciones.push(`e.fecha_inicio >= ? AND e.fecha_inicio < ?`);
        }
        params.push(fechaDesdeSQL, fechaHastaSQL);

        // Filtros opcionales
        if (data.tracking) {
            condiciones.push(`e.tracking_number LIKE ?`);
            params.push(data.tracking);
        }
        if (data.destinatarioNombnre) {
            condiciones.push(`e.destination_receiver_name LIKE ?`);
            params.push(`%${data.destinatarioNombnre}%`);
        }
        if (data.nombreFantasia) {
            condiciones.push(`c.nombre_fantasia LIKE ?`);
            params.push(data.nombreFantasia);
        }
        if (data.IDML) {
            condiciones.push(`(e.ml_venta_id LIKE ? OR e.ml_pack_id LIKE ?)`);
            params.push(data.IDML, data.IDML);
        }
        if (data.zonaCosto) {
            condiciones.push(`ce.nameZonaCostoCliente LIKE ?`);
            params.push(data.zonaCosto);
        }
        if (data.asignado) {
            condiciones.push(`e.choferAsignado IS NOT NULL`);
        }
        if (data.zonaEntrega) {
            condiciones.push(`e.zonaEntrega in (?)`);
            params.push(data.zonaEntrega);
        }
        if (data.turbo) {
            condiciones.push(`e.turbo = 1`);
        }
        if (data.chofer) {
            if (data.chofer == 1) {
                condiciones.push(`e.choferAsignado != 0`);
                if (data.nombreCadete) {
                    condiciones.push(`su.usuario LIKE ?`);
                    params.push(`%${data.nombreCadete}%`);
                }
            } else if (data.chofer == 0) {
                condiciones.push(`e.choferAsignado = 0`);
            }
        }

        // Foto
        if (data.foto) {
            if (data.foto === "si") {
                condiciones.push(`EXISTS (SELECT 1 FROM envios_fotos ef WHERE ef.didEnvio = e.did AND ef.elim = 0)`);
            } else if (data.foto === "no") {
                condiciones.push(`NOT EXISTS (SELECT 1 FROM envios_fotos ef WHERE ef.didEnvio = e.did AND ef.elim = 0)`);
            }
        }

        // Cobranzas
        if (data.cobranzas !== undefined) {
            if (data.cobranzas == 1) {
                condiciones.push(`EXISTS (SELECT 1 FROM envios_cobranza ec WHERE ec.didEnvio = e.did AND ec.elim = 0)`);
            } else if (data.cobranzas == 0) {
                condiciones.push(`NOT EXISTS (SELECT 1 FROM envios_cobranza ec WHERE ec.didEnvio = e.did AND ec.elim = 0)`);
            }
        }

        // Observaciones
        if (data.observaciones !== undefined) {
            if (data.observaciones == 1) {
                condiciones.push(`(
                    (e.obs IS NOT NULL AND e.obs <> '') 
                    OR EXISTS (
                        SELECT 1 
                        FROM envios_observaciones eo 
                        WHERE eo.didEnvio = e.did 
                        AND eo.elim = 0
                    )
                )`);
            } else if (data.observaciones == 0) {
                condiciones.push(`(
                    (e.obs IS NULL OR e.obs = '') 
                    AND NOT EXISTS (
                        SELECT 1 
                        FROM envios_observaciones eo 
                        WHERE eo.didEnvio = e.did 
                        AND eo.elim = 0
                    )
                )`);
            }
        }

        // Logística inversa
        if (data.logisticaInversa !== undefined) {
            if (data.logisticaInversa == 1) {
                condiciones.push(`EXISTS (SELECT 1 FROM envios_logisticainversa eli WHERE eli.didEnvio = e.did AND eli.elim = 0)`);
            } else if (data.logisticaInversa == 0) {
                condiciones.push(`NOT EXISTS (SELECT 1 FROM envios_logisticainversa eli WHERE eli.didEnvio = e.did AND eli.elim = 0)`);
            }
        }

        if (data.destinoDireccion) {
            condiciones.push(`COALESCE(ed.address_line, e.destination_shipping_address_line) LIKE ?`);
            params.push(`%${data.destinoDireccion}%`);
        }

        const whereClause = `WHERE ${condiciones.join(" AND ")}`;

        const query = `
            SELECT 
                e.did,
                e.didCliente,
                e.estado_envio,
                e.estado,
                e.fecha_venta,
                e.choferAsignado,
                DATE_FORMAT(e.fecha_inicio, '%d/%m/%Y %H:%i') AS fecha_inicio_formateada,
                e.flex,
                e.destination_receiver_name,
                e.ml_vendedor_id,
                e.ml_qr_seguridad,
                e.tracking_number,
                e.fecha_inicio,
                su.usuario,
                ce.nameZonaCostoCliente,
                c.nombre_fantasia,
                c.elim AS elimClie,
                COALESCE(ed.cp, e.destination_shipping_zip_code) AS cp
            FROM envios e
            LEFT JOIN envios_direcciones_destino ed ON e.did = ed.didEnvio AND ed.elim = 0 AND ed.superado = 0
            LEFT JOIN envios_historial eh ON e.did = eh.didEnvio AND eh.elim = 0 
            LEFT JOIN envios_asignaciones ea ON e.did = ea.didEnvio AND ea.elim = 0 AND ea.superado = 0
            LEFT JOIN sistema_usuarios su ON e.choferAsignado = su.did AND su.elim = 0 AND su.superado = 0
            LEFT JOIN costos_envios ce ON e.did = ce.didEnvio AND ce.elim = 0 AND ce.superado = 0
            LEFT JOIN clientes c ON e.didCliente = c.did AND c.elim = 0 AND c.superado = 0
            ${whereClause}
            ORDER BY e.id DESC
        `;

        const results = await executeQuery(connection, query, params);

        const total = results.length;
        const desde = (pagina - 1) * cantidad;
        const hasta = desde + cantidad;
        const paginados = results.slice(desde, hasta);

        const listado = paginados.map(row => ({
            codigo: row.codigo,
            cp: row.cp || '',
            did: row.did,
            didCliente: row.didCliente,
            didCadete: row.choferAsignado,
            elimClie: row.elimClie,
            estado_envio: row.estado_envio,
            estadoml: row.estado,
            fechagestionar: row.fecha_inicio_formateada,
            fecha_venta: row.fecha_venta,
            flexname: row.flex,
            ml_vendedor_id: row.ml_vendedor_id,
            namecadete: row.usuario,
            nombre: row.nombre_fantasia || '',
            nombre_fantasia: row.nombre_fantasia,
            ml_qr_seguridad: row.ml_qr_seguridad,
            tracking: row.tracking_number,
            fecha_inicio: row.fecha_inicio,
            zonacosto: row.nameZonaCostoCliente,
        }));

        return {
            estado: true,
            data: listado,
            total,
            pagina,
            cantidad,
            filtros: {
                fechaDesde,
                fechaHasta,
                tracking: data.tracking || null,
                foto: data.foto || null
            }
        };
    } catch (error) {
        console.error("❌ Error en ListarEnvio:", error);
        throw error;
    }
}



module.exports = {
    ListarEnvio
};
