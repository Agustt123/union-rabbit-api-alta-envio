const { executeQuery } = require("../../dbconfig");

async function ListarEnvio(connection, didEmpresa) {

    try {
        const query = `SELECT 
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
ORDER BY e.id DESC;`;


        const results = await executeQuery(connection, query, []);


        for (row of results) {

            listado = {
                codigo: row.codigo, //si
                cp: row.cp || '', //si
                did: row.did,
                didCliente: row.didCliente,//si
                didCadete: row.choferAsignado,//si
                elimClie: row.elimClie,//si
                estado_envio: row.estado_envio,//si
                estadoml: row.estado,//si
                estimated_delivery_time_date_72: row.estimated_delivery_time_date_72,//si
                fechagestionar: row.fecha_inicio_formateada,//si
                fecha_venta: row.fecha_venta,//si
                flexname: row.flex,//si
                lead_time_shipping_method_name: row.lead_time_shipping_method_name,//si
                localidad: row.localidad || '',//si
                ml_vendedor_id: row.ml_vendedor_id,//si
                namecadete: row.usuario,//si
                nombre: row.nombre_fantasia || '',//si
                nombre_fantasia: row.nombre_fantasia,
                ml_qr_seguridad: row.ml_qr_seguridad,
                tracking: row.tracking_number,//si
                valor_declarado: row.valor_declarado,//si
                autoFecha: row.autoFecha,
                zonacosto: row.nameZonaCostoCliente,//si
            }

        }
        return { estado: true, data: listado } || { estado: false, data: null };
    } catch (error) {
        throw error;
    }
}

module.exports = {
    ListarEnvio
}