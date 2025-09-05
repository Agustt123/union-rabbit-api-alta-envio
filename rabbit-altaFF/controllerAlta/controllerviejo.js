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
const {
  logYellow,
  logGreen,
  logPurple,
  logBlue,
} = require("../fuctions/logsCustom");
const { error } = require("console");
const sendToShipmentStateMicroService = require("../fuctions/sendToshipmentStateMicroservice");
const { json } = require("stream/consumers");
const { getConnection, executeQuery } = require("../dbconfig");
const OrdenesItems = require("../controller/ordenes/claseordenesItems");

async function AltaEnvio(company, data) {
  // console.log("AltaEnvio", data, company);

  const connection = await getConnection(company.did);

  try {
    if (data.data.operador == "enviosMLIA") {
      if (data.data.ia == 1) {
        const querycheck =
          "SELECT ml_vendedor_id, ml_shipment_id FROM envios WHERE ml_vendedor_id = ? AND ml_shipment_id = ? AND elim = 0 and superado = 0";
        const result = await executeQuery(connection, querycheck, [
          data.data.ml_vendedor_id,
          data.data.ml_shipment_id,
        ]);
        if (result.length > 0) {
          console.log("El envio ya existe", result);
          return {
            status: 400,
            message: "El envio ya existe",
          };
        }
      }
      /*  if (data.data.ff == 1) {
        const querycheck =
          "SELECT ml_vendedor_id, ml_shipment_id FROM envios WHERE ml_venta_id = ? AND ml_pack_id = ? AND elim = 0 and superado = 0";
        const result = await executeQuery(connection, querycheck, [
          data.data.ml_venta_id,
          data.data.ml_pack_id,
        ]);

        if (result.length > 0) {
          const checkstatusorder =
            "select status from ordenes where number = ? and superado = 0 and elim = 0";
          const status_order = await executeQuery(
            connection,
            checkstatusorder,
            [data.data.orden]
          );
          console.log("El envio ya existe", result);

          let estado = status_order || 7; // Estado por defecto si no se proporciona
        }
      } */
    }
    try {
      let insertId;

      if (data.data.flex === 1 && data.data.mlIa == 0) {
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
          data.data.estado_envio || 0
        );

        const resultado = await envioflex.insert();
        insertId = resultado.did;
        console.log("Registro insertado con ID:", insertId);
      } else {
        if (
          !data.data ||
          !data.data.enviosDireccionesDestino ||
          !data.data.enviosDireccionesDestino.calle ||
          !data.data.enviosDireccionesDestino.cp
        ) {
          return false;
        }

        const email = data.data.destination_receiver_email;
        delete data.data.destination_receiver_email;
        console.log("Todos los campos son válidos.");

        if (email) {
          data.data.destination_receiver_email = email;
        }
        // Solo insertar en ordenes si fulfillment es 0

        // Establecer elim en 52 si fulfillment es 0
        if (data.data.ff === 1) {
          data.data.elim = 52;

          const queryCheck = `
            SELECT ml_vendedor_id, ml_shipment_id, estado_envio, did 
            FROM envios 
            WHERE ml_venta_id = ? AND ml_pack_id = ? AND superado = 0`;

          const result = await executeQuery(
            connection,
            queryCheck,
            [data.data.ml_venta_id, data.data.ml_pack_id],
            true
          );

          // Establecer estado basado en status_order
          if (data.data.status_order === "paid") {
            data.data.estado = 17; // Estado 1 para "paid"
          } else if (data.data.status_order === "cancelled") {
            data.data.estado = 13; // Estado 2 para "cancelled"
          }

          // Verificar si hay resultados y comparar estados
          if (result.length > 0) {
            const currentStatus = result[0].estado_envio; // Estado actual
            const newStatus = data.data.estado; // Nuevo estado que se quiere establecer
            console.log(
              "Estado actual:",
              currentStatus,
              "Nuevo estado:",
              newStatus
            );

            // Si el estado actual es el mismo que el nuevo, cortar el proceso
            if (currentStatus === newStatus) {
              console.log("El estado es el mismo. Corte del proceso.");
              return {
                status: 200,
                message: "El estado es el mismo. No se requiere acción.",
              };
            }

            // Si el estado es diferente, continuar con la lógica
            data.data.did = result[0].did;
            console.log(data.data, "data.data con did");

            const envio = new Envios(data.data, company, connection);
            const resultado = await envio.insert();
            insertId = result[0].did;
            console.log(resultado, "resultado envio");
          }

          logGreen(`Registro insertado con did: ${insertId}`);
        } else {
          const envio = new Envios(data.data, company, connection);
          const resultado = await envio.insert();
          insertId = resultado.did;
          console.log(resultado, "resultado envio");

          logGreen(`Registro insertado con did: ${insertId}`);
        }

        // Validación y creación de EnviosCobranza
        if (data.data.envioscobranza) {
          const cobranza = new EnviosCobranza(
            insertId,
            data.data.envioscobranza.didCampoCobranza,
            data.data.envioscobranza.valor,
            data.data.envioscobranza.quien,
            0,
            company,
            connection
          );
          await cobranza.insert();
        }

        // Validación y creación de EnviosLogisticaInversa
        if (data.data.enviosLogisticaInversa) {
          const logisticaInversa = new EnviosLogisticaInversa(
            insertId,
            data.data.enviosLogisticaInversa.didCampoLogistica,
            data.data.enviosLogisticaInversa.valor,
            data.data.enviosLogisticaInversa.quien,
            company,
            connection
          );
          await logisticaInversa.insert();
        }

        // Validación y creación de EnviosObservaciones
        if (data.data.enviosObservaciones) {
          const observacionDefault =
            data.data.enviosObservaciones.observacion ||
            "";
          const observaciones = new EnviosObservaciones(
            insertId,
            observacionDefault,
            data.data.enviosObservaciones.quien,
            data.data.enviosObservaciones.desde,
            company,
            connection
          );
          await observaciones.insert();
        }

        if (data.data.ff === 1 && Array.isArray(data.data.orders)) {
          for (const ordenData of data.data.orders) {
            /*const querycheck =
              "SELECT ml_vendedor_id, ml_shipment_id FROM envios WHERE ml_venta_id = ? AND ml_pack_id = ? AND elim = 0 and superado = 0";
            const result = await executeQuery(connection, querycheck, [
              data.data.ml_venta_id,
              data.data.ml_pack_id,
            ]);

            if (result.length > 0) {
              const checkstatusorder =
                "select status from ordenes where number = ? and superado = 0 and elim = 0";
              const status_order = await executeQuery(
                connection,
                checkstatusorder,
                [ordenData.number]
              );
              console.log("El envio ya existe", result);

              let estado = status_order || 7; // Estado por defecto si no se proporciona
            }*/

            // Aquí dentro del for ya ordenData existe
            const orden = new Ordenes({
              did: 0,
              didEnvio: insertId,
              didCliente: data.data.didCliente,
              didCuenta: data.data.didCuenta,
              status: "paid",
              flex: data.data.flex,
              fecha_venta: ordenData.fecha_venta || data.data.fecha_venta || "",
              number: ordenData.number || "",
              observaciones:
                ordenData.enviosObservaciones?.observacion ||
                data.data.enviosObservaciones?.observacion ||
                "Observación por defecto",
              armado: 0,
              descargado: 0,
              fecha_armado: null,
              quien_armado: "0",
              idEmpresa: company.did,
              connection: connection,
            });

            logYellow(`${JSON.stringify(orden)} insertando orden`);
            const resultadoOrden = await orden.insert();
            console.log(resultadoOrden, "resultado orden");

            for (const item of ordenData.items) {
              const ordenItems = new OrdenesItems(
                resultadoOrden.insertId,
                item.codigo,
                item.imagen,
                item.descripcion,
                item.ml_id,
                item.dimensions,
                item.cantidad,
                item.variacion,
                item.seller_sku,
                connection
              );

              const insertIdItems = await ordenItems.insert();
              console.log(
                `Orden Items insertados con ID: ${insertIdItems.insertId}`
              );
            }
          }
        }

        // Validación y creación de EnviosDireccionesDestino
        if (data.data.enviosDireccionesDestino) {
          const direccionDestino = new EnviosDireccionesDestino(
            data.data.enviosDireccionesDestino.did,
            insertId,
            data.data.enviosDireccionesDestino.calle,
            data.data.enviosDireccionesDestino.numero,
            data.data.enviosDireccionesDestino.address_line ||
            `${data.data.enviosDireccionesDestino.calle} ${data.data.enviosDireccionesDestino.numero}`,
            data.data.enviosDireccionesDestino.cp,
            data.data.enviosDireccionesDestino.ciudad,
            data.data.enviosDireccionesDestino.localidad,
            data.data.enviosDireccionesDestino.provincia,
            data.data.enviosDireccionesDestino.pais || "Argentina",
            data.data.enviosDireccionesDestino.latitud,
            data.data.enviosDireccionesDestino.longitud,
            data.data.enviosDireccionesDestino.quien,
            company,
            data.data.enviosDireccionesDestino.destination_comments,
            data.data.enviosDireccionesDestino.delivery_preference,
            data.data.enviosDireccionesDestino.conHorario,
            data.data.enviosDireccionesDestino.prioridad,
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
            data.data.enviosDireccionesRemitente.calle +
            data.data.enviosDireccionesRemitente.numero,
            data.data.enviosDireccionesRemitente.cp,
            data.data.enviosDireccionesRemitente.localidad,
            data.data.enviosDireccionesRemitente.provincia,
            data.data.enviosDireccionesRemitente.pais || "Argentina",
            data.data.enviosDireccionesRemitente.latitud,
            data.data.enviosDireccionesRemitente.longitud,
            data.data.enviosDireccionesRemitente.obs ||
            "observaciones light data",
            data.data.enviosDireccionesRemitente.quien,
            company,
            connection
          );
          await direccionRemitente.insert();
        }

        // Validación y creación de EnviosItems
        // Validación y creación de EnviosItems
        if (data.data.enviosItems) {
          const items = Array.isArray(data.data.enviosItems)
            ? data.data.enviosItems
            : [data.data.enviosItems]; // Convertimos en array si es un único objeto

          for (const item of items) {
            const enviosItems = new EnviosItems(
              insertId,
              item.codigo,
              item.imagen,
              item.descripcion,
              item.ml_id,
              item.dimensions,
              item.cantidad,
              item.variacion,
              item.seller_sku,
              item.descargado,
              item.autofecha,
              item.superado,
              item.elim,
              company,
              connection
            );
            const insertIdItems = await enviosItems.insert(); // Asegúrate de que `insert()` esté definido en EnviosItems
          }
        }

        let respuesta = await sendToShipmentStateMicroService(
          company.did,
          data.data.quien,
          insertId,
          data.data.estado ?? 7
        );
        console.log(respuesta, "respuesta");

        logPurple("FINAL");
        return true;
      }
    } catch (error) {
      console.error("Error durante la inserción:", error);
      return false;
    }
  } catch (error) {
    console.error("Error en la función principal:", error);
    return false;
  } finally {
    connection.end(); // Liberar la conexión
  }
}

module.exports = {
  AltaEnvio,
};
