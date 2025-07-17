const Module = require("module");
const Envios = require("../controller/envios/clase-envios");
const EnviosCobranza = require("../controller/envios/Clase-envios_cobranza");
const EnviosDireccionesDestino = require("../controller/envios/clase-envios_direcciones_destino");
const EnviosItems = require("../controller/envios/clase-envios_items");
const EnviosLogisticaInversa = require("../controller/envios/clase-envios_logisticainversa");
const EnviosObservaciones = require("../controller/envios/clase-envios_observaciones");
const EnviosDireccionesRemitente = require("../controller/envios/clase-envios_remitente");
const EnviosFlex = require("../controller/envios/clase-enviosflex");
const Ordenes = require("../controller/ordenes/claseordenes");
const { logYellow, logGreen, logPurple, logBlue } = require("../fuctions/logsCustom");
const { error } = require("console");
const sendToShipmentStateMicroService = require("../fuctions/sendToshipmentStateMicroservice");
const { json } = require("stream/consumers");
const { checkToken } = require("../fuctions/checkTokenCliente");
const CamposExtras = require("../controller/envios/clase-campos-extras");
const CostoEnvio = require("../controller/envios/clase-costo-envio");





async function AltaEnvio2(company, connection, data) {
    try {
        if (!data.data || !data.data.enviosDireccionesDestino ||
            !data.data.enviosDireccionesDestino.calle ||

            !data.data.enviosDireccionesDestino.cp
        ) {

            return {
                success: false,
                error: -1,
                message: "Datos de envío inválidos.",
            };
        }

        const tokenData = await checkToken(data.data.token, connection);
        console.log("Token Data:", tokenData);

        if (tokenData) {
            data.data.didCliente = tokenData.didCliente;
            data.data.didCuenta = tokenData.didCuenta;

        }
        console.log(data.data.didCliente, "didCliente");


        const email = data.data.destination_receiver_email;
        delete data.data.destination_receiver_email;
        console.log("Todos los campos son válidos.");

        if (email) {
            data.data.destination_receiver_email = email;
        }

        try {
            let insertId;

            if (data.data.flex === 1) {
                const envioflex = new EnviosFlex(
                    data.data.did,
                    data.data.ml_shipment_id,
                    data.data.ml_vendedor_id,
                    data.data.ml_qr_seguridad,
                    data.data.didCliente,
                    data.data.didCuenta,
                    data.data.elim,
                    company.did,
                    connection,
                    data.data.estado_envio || 0,
                );

                const resultado = await envioflex.insert();
                insertId = resultado.did;
                console.log("Registro insertado con ID:", insertId);
            } else {
                // Solo insertar en ordenes si fulfillment es 0
                if (data.data.fullfillment === 1) {
                    const orden = new Ordenes({
                        did: data.data.did || 0,
                        didEnvio: insertId,
                        didCliente: data.data.didCliente,
                        didCuenta: data.data.didCuenta,
                        status: "Pendiente",
                        flex: data.data.flex,
                        number: `ORD-${new Date().getTime()}`,
                        observaciones: data.data.observaciones || "",
                        armado: 0,
                        descargado: 0,
                        fecha_armado: null,
                        quien_armado: "2",
                        idEmpresa: company.did,
                        connection: connection
                    });

                    logYellow(`${JSON.stringify(orden)} insertando orden`);
                    const resultadoOrden = await orden.insert();
                }

                // Establecer elim en 52 si fulfillment es 0
                if (data.data.fullfillment === 1) {
                    data.data.elim = 52; // Modificar el campo elim
                }

                const envio = new Envios(data.data, company, connection);
                const resultado = await envio.insert();
                insertId = resultado.did;
                /* console.log(envio, "envio");
                 console.log(data.data, "data");*/


                if (
                    data.data.did &&
                    data.data.did !== "0" &&
                    data.data.did !== 0 &&
                    data.data.did !== null &&
                    data.data.did !== undefined &&
                    data.data.did !== ""
                ) {
                    console.log(data.data.did, "data.data.did");
                    insertId = data.data.did;
                }

                logGreen(`Registro insertado con did: ${insertId}`);

                // Validación y creación de EnviosCobranza
                // Procesar envioscobranza (array de objetos)
                if (Array.isArray(data.data.envioscobranza)) {
                    for (const item of data.data.envioscobranza) {
                        const cobranza = new EnviosCobranza(
                            insertId,
                            item.campo || 4,
                            item.valor,
                            data.data.quien || 0,
                            0,
                            company,
                            connection
                        );
                        await cobranza.insert();
                    }
                }
                else if (data.data.envioscobranza) {
                    // Caso individual (backward compatibility)
                    const item = data.data.envioscobranza;
                    const cobranza = new EnviosCobranza(
                        insertId,
                        item.campo || 4,

                        item.valor,
                        data.data.quien || 0,
                        0,
                        company,
                        connection
                    );
                    await cobranza.insert();
                }

                // Procesar enviosLogisticaInversa (array de objetos)
                if (Array.isArray(data.data.enviosLogisticaInversa)) {
                    for (const item of data.data.enviosLogisticaInversa) {
                        const logisticaInversa = new EnviosLogisticaInversa(
                            insertId,
                            item.campo || 1,
                            item.valor || 0,
                            data.data.quien || 0,
                            company,
                            connection
                        );
                        await logisticaInversa.insert();
                    }
                } else if (data.data.enviosLogisticaInversa) {
                    // Caso individual
                    const item = data.data.enviosLogisticaInversa;
                    const logisticaInversa = new EnviosLogisticaInversa(
                        insertId,
                        item.campo || 1,
                        item.valor || 0,
                        data.data.quien || 0,
                        company,
                        connection
                    );
                    await logisticaInversa.insert();
                }


                // Validación y creación de EnviosObservaciones
                if (data.data.enviosObservaciones) {
                    const observacionDefault = data.data.enviosObservaciones.observaciones || "";

                    const observaciones = new EnviosObservaciones(
                        insertId,
                        observacionDefault,
                        data.data.quien || 0,
                        data.data.enviosObservaciones.desde || "",
                        company,
                        connection
                    );
                    await observaciones.insert();
                }

                // Validación y creación de EnviosDireccionesDestino
                if (data.data.enviosDireccionesDestino) {
                    const direccionDestino = new EnviosDireccionesDestino(
                        data.data.enviosDireccionesDestino.did,
                        insertId,
                        data.data.enviosDireccionesDestino.calle || "",
                        data.data.enviosDireccionesDestino.numero || "",
                        data.data.enviosDireccionesDestino.address_line || `${data.data.enviosDireccionesDestino.calle} ${data.data.enviosDireccionesDestino.numero}` || "",
                        data.data.enviosDireccionesDestino.cp || "",
                        data.data.enviosDireccionesDestino.ciudad || "",
                        data.data.enviosDireccionesDestino.localidad || "",
                        data.data.enviosDireccionesDestino.provincia || "",
                        data.data.enviosDireccionesDestino.pais || "Argentina",
                        data.data.enviosDireccionesDestino.latitud || 0,
                        data.data.enviosDireccionesDestino.longitud || 0,
                        data.data.quien || 0,
                        company,
                        data.data.enviosDireccionesDestino.destination_comments || "",
                        data.data.enviosDireccionesDestino.delivery_preference || "",
                        data.data.enviosDireccionesDestino.conHorario || "",
                        data.data.enviosDireccionesDestino.prioridad || 0,
                        connection
                    );
                    await direccionDestino.insert();
                }

                // Validación y creación de EnviosDireccionesRemitente
                if (data.data.enviosDireccionesRemitente) {
                    const direccionRemitente = new EnviosDireccionesRemitente(
                        data.data.enviosDireccionesRemitente.did,
                        insertId,
                        data.data.enviosDireccionesRemitente.calle,
                        data.data.enviosDireccionesRemitente.numero,
                        data.data.enviosDireccionesRemitente.calle + data.data.enviosDireccionesRemitente.numero,
                        data.data.enviosDireccionesRemitente.cp,
                        data.data.enviosDireccionesRemitente.localidad,
                        data.data.enviosDireccionesRemitente.provincia,
                        data.data.enviosDireccionesRemitente.pais || "Argentina",
                        data.data.enviosDireccionesRemitente.latitud,
                        data.data.enviosDireccionesRemitente.longitud,
                        data.data.enviosDireccionesRemitente.obs || 'observaciones light data',
                        data.data.quien,
                        company,
                        connection
                    );
                    await direccionRemitente.insert();
                }

                if (Array.isArray(data.data.camposExtras)) {
                    for (const item of data.data.camposExtras) {
                        const camposExtras = new CamposExtras(
                            insertId,
                            item.campo || "",
                            item.valor || "",
                            data.data.quien || 0,
                            company,
                            connection
                        );
                        await camposExtras.insert();
                    }
                }

                if (data.data.costoEnvio) {
                    const costoEnvio = new CostoEnvio(
                        data.data.costoEnvio.didEnvio || insertId,

                        data.data.costoEnvio.chofer || "",
                        data.data.costoEnvio.valor || "",
                        data.data.costoEnvio.date_chofer || "",
                        data.data.costoEnvio.date_cliente || "",
                        data.data.costoEnvio.nameZonaCostoChofer || "",
                        data.data.costoEnvio.nameZonaCostoCliente || "",
                        company,
                        connection
                    );
                    await costoEnvio.insert();
                }


                // Validación y creación de EnviosItems
                if (data.data.enviosItems) {
                    const enviosItems = new EnviosItems(
                        insertId,
                        data.data.enviosItems.codigo,
                        data.data.enviosItems.imagen,
                        data.data.enviosItems.descripcion,
                        data.data.enviosItems.ml_id,
                        data.data.enviosItems.dimensions,
                        data.data.enviosItems.cantidad,
                        data.data.enviosItems.variacion,
                        data.data.enviosItems.seller_sku,
                        data.data.enviosItems.descargado,
                        data.data.detallesProducto || "",
                        data.data.enviosItems.autofecha,
                        data.data.enviosItems.superado,
                        data.data.enviosItems.elim,
                        company,
                        connection
                    );
                    await enviosItems.insert(); // Asegúrate de que `insert()` esté definido en EnviosItems
                }




                let respuesta = await sendToShipmentStateMicroService(company.did, data.data.quien || 0, insertId, data.data.estado || 7);
                console.log(respuesta, "respuesta");
                const qr = { local: 1, did: insertId, cliente: data.data.didCliente, empresa: company.did }
                logPurple("FINAL");
                return {
                    estado: true,
                    insertId: insertId,
                    dataqr: qr
                }
            }


        } catch (error) {

            console.error("Error durante la inserción:", error);
            return {
                success: false,
                error: -1,
                message: error
            }
        }
    } catch (error) {
        console.error("Error en la función principal:", error);
        return {
            success: false,
            error: -1,
            message: error.message || "Error desconocido"
        };
    }
}

module.exports = {
    AltaEnvio2
};
