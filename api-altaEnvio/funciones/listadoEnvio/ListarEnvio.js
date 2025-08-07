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

async function ListarEnvio(connection, didEmpresa, data = {}, pagina = 1, cantidad = 10) {
    try {
        const condiciones = [`e.elim = 0`, `e.superado = 0`];
        const params = [];

        // Fechas por defecto: últimos 7 días
        const hoy = new Date();
        const hace7Dias = new Date();
        hace7Dias.setDate(hoy.getDate() - 7);

        const fechaDesde = data.fechaDesde || formatDate(hace7Dias);
        const fechaHasta = data.fechaHasta || formatDate(hoy);

        const fechaDesdeSQL = formatDatetimeStart(fechaDesde);
        const fechaHastaSQL = formatDatetimeEnd(fechaHasta);

        condiciones.push(`e.autoFecha >= ? AND e.autoFecha < ?`);
        params.push(fechaDesdeSQL, fechaHastaSQL);

        // Filtro por tracking si viene
        if (data.tracking) {
            condiciones.push(`e.tracking_number = ?`);
            params.push(data.tracking);
        }

        const whereClause = `WHERE ${condiciones.join(" AND ")}`;

        const query = `
            SELECT 
                e.did,
                e.didCliente,
                e.choferAsignado,
                e.estado_envio,
                e.estado,
                e.estimated_delivery_time_date_72,
                e.fecha_venta,
                DATE_FORMAT(e.fecha_inicio, '%d/%m/%Y %H:%i') AS fecha_inicio_formateada,
                e.flex,
                e.lead_time_shipping_method_name,
                e.ml_vendedor_id,
                e.ml_qr_seguridad,
                e.tracking_number,
                e.valor_declarado,
                e.autoFecha,
                su.usuario,
                ce.nameZonaCostoCliente,
                c.codigo,
                c.nombre_fantasia,
                c.elim AS elimClie,
                COALESCE(ed.cp, e.destination_shipping_zip_code) AS cp,
                COALESCE(ed.localidad, e.destination_city_name) AS localidad
            FROM envios e
            LEFT JOIN envios_direcciones_destino ed ON e.did = ed.didEnvio AND ed.elim = 0 AND ed.superado = 0
            LEFT JOIN sistema_usuarios su ON e.choferAsignado = su.did AND su.elim = 0 AND su.superado = 0
            LEFT JOIN costos_envios ce ON e.did = ce.didEnvio AND ce.elim = 0 AND ce.superado = 0
            LEFT JOIN clientes c ON e.didCliente = c.did AND c.elim = 0 AND c.superado = 0
            ${whereClause}
            ORDER BY e.id DESC
        `;

        // Ejecutamos SIN limit ni offset
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
            estimated_delivery_time_date_72: row.estimated_delivery_time_date_72,
            fechagestionar: row.fecha_inicio_formateada,
            fecha_venta: row.fecha_venta,
            flexname: row.flex,
            lead_time_shipping_method_name: row.lead_time_shipping_method_name,
            localidad: row.localidad || '',
            ml_vendedor_id: row.ml_vendedor_id,
            namecadete: row.usuario,
            nombre: row.nombre_fantasia || '',
            nombre_fantasia: row.nombre_fantasia,
            ml_qr_seguridad: row.ml_qr_seguridad,
            tracking: row.tracking_number,
            valor_declarado: row.valor_declarado,
            autoFecha: row.autoFecha,
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
                tracking: data.tracking || null
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
