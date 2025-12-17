const Envios = require("../controller/envios/clase-envios");
const EnviosDireccionesDestino = require("../controller/envios/clase-envios_direcciones_destino");
const { logYellow, logGreen, logPurple, logBlue } = require("../fuctions/logsCustom");
const sendToShipmentStateMicroServiceAPI = require("../fuctions/sendToshipmentStateMicroserviceApi");

async function AltaEnvioMisPicho(company, connection, data) {
    try {

        const dataEnvio = {
            did: data.data.idenvio || 0,
            destination_receiver_name: data.data.destinatario,
            destination_receiver_email: data.data.email,
            fecha_venta: data.data.fechaVenta,
            peso: data.data.peso,
            obs: data.data.obs || "",
            monto_total_a_cobrar: data.data.total_a_cobrar || 0,
            valor_declarado: data.data.valor_declarado || 0,
            did: data.data.idenvio || 0,
            delivery_preference: data.data.delivery_preference || "",
            ml_id_venta: data.data.id_venta || "",
            ml_vendedor_id: data.data.id_seller || "",
            didCliente: data.data.didCliente,
            didCuenta: data.data.didCuenta,


            flex: 21,
        };

        try {
            let insertId;

            const envio = new Envios(dataEnvio, company, connection);
            const resultado = await envio.insert();
            insertId = resultado.did;

            if (
                data.data.did &&
                data.data.did !== "0" &&
                data.data.did !== 0 &&
                data.data.did !== null &&
                data.data.did !== undefined &&
                data.data.did !== ""
            ) {
                insertId = data.data.did;
            }

            logGreen(`Registro insertado con did: ${insertId}`);

            // LIMPIA CP → SOLO NÚMEROS
            const cleanCp = (cp) => (cp || "").replace(/\D/g, "");

            const direccionDestino = new EnviosDireccionesDestino(
                0, // SIEMPRE 0: ES NUEVA DIRECCIÓN
                insertId,
                data.data.calle || "",
                data.data.numero || "",
                `${data.data.calle} ${data.data.numero}` || "",
                cleanCp(data.data.cp),
                data.data.comuna || "",
                data.data.localidad || "",
                data.data.provincia || "",
                data.data.pais || "Argentina",
                data.data.latitud || 0,
                data.data.longitud || 0,
                data.data.quien || 0,
                company,
                data.data.destination_comments || "",
                data.data.delivery_preference || "",
                data.data.conHorario || "",
                data.data.prioridad || 0,
                connection
            );

            await direccionDestino.insert();

            await sendToShipmentStateMicroServiceAPI(
                company.did,
                data.data.quien || 0,
                insertId,
                data.data.estado || 7,
                connection
            );

            const qr = {
                local: 1,
                did: insertId,
                cliente: data.data.didCliente,
                empresa: company.did
            };

            logPurple("FINAL");

            return {
                estado: true,
                insertId: insertId,
                dataqr: qr,
                token: null, // tokenCliente no existe
                didEmpresa: company.did
            };

        } catch (error) {
            console.error("Error durante la inserción:", error);
            return {
                success: false,
                error: -1,
                message: error
            };
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
    AltaEnvioMisPicho
};
