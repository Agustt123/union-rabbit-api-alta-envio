const { executeQuery } = require("../../dbconfig");

async function ListarEnvio(connection, pagina = 1, cantidad = 10) {
    try {
        const offset = (pagina - 1) * cantidad;

        // Consulta total
        const totalQuery = `
            SELECT COUNT(*) AS total
            FROM envios e
            WHERE e.elim = 0 AND e.superado = 0
        `;
        const [totalResult] = await executeQuery(connection, totalQuery, []);
        const total = totalResult.total;

        // Consulta paginada
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
            WHERE e.elim = 0 AND e.superado = 0
            ORDER BY e.id DESC
            LIMIT ? OFFSET ?
        `;

        const results = await executeQuery(connection, query, [cantidad, offset]);

        const listado = results.map(row => ({
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
            cantidad
        };
    } catch (error) {
        throw error;
    }
}

module.exports = {
    ListarEnvio
};
