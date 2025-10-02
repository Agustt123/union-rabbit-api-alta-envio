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
const OrdenesItems = require("../controller/ordenes/claseordenesItems");
const { logYellow, logGreen, logPurple } = require("../fuctions/logsCustom");
const sendToShipmentStateMicroService = require("../fuctions/sendToshipmentStateMicroservice");
const { getConnection, executeQuery } = require("../dbconfig");
const { stat } = require("fs");
const { log } = require("console");
const { checkToken } = require("../fuctions/checkTokenCliente");


async function AltaEnvio(company, data) {
  const connection = await getConnection(company.did);

  // 🔹 Validar token o didCliente/didCuenta
  let tokenData = null;
  if (data.data.token) {
    tokenData = await checkToken(data.data.token, connection);
    if (!tokenData) {
      throw new Error("Token inválido");
    }
    data.data.didCliente = tokenData.didCliente;
    data.data.didCuenta = tokenData.didCuenta;
  } else if (data.data.didCliente && data.data.didCuenta) {
    // Si ya vienen proporcionados, se usan tal cual
    tokenData = {
      didCliente: data.data.didCliente,
      didCuenta: data.data.didCuenta
    };
  } else {
    throw new Error("Token o cliente no proporcionado");
  }

  //data.data.status_order = "paid";

  try {
    const yaExiste = await checkExistingShipment(data, connection);
    logYellow(`yaExiste: ${yaExiste}`);
    if (yaExiste) {
      return {
        estado: false,
        mensaje: "El envío ya existe. Si querés volver a insertarlo, primero debés eliminarlo.",
      };
    }

    let insertId;
    if (data.data.flex === 1 && data.data.mlIa == 88) {
      insertId = await insertEnvioFlex(data, company, connection);
    } else {


      const email = data.data.destination_receiver_email;
      delete data.data.destination_receiver_email;
      if (email) {
        data.data.destination_receiver_email = email;
      }

      if (data.data.ff === 1) {
        data.data.elim = 52;
        const result = await handleFulfillment(data, connection, company);
        if (!result.status) {
          console.log("No se encontró fulfillment, insertando nuevo envío...");
          insertId = await insertStandardEnvio(data, company, connection);
        } else {
          insertId = result.insertId;
        }
      } else {
        insertId = await insertStandardEnvio(data, company, connection);
      }
    }

    await processRelatedData(data, insertId, company, connection);

    return { estado: true, didEnvio: insertId };
  } catch (error) {
    console.error("Error en la función principal:", error);
    return {
      estado: false,
      error: -1,
      message: `Error en la función principal: ${error.message}`
    };
  } finally {
    connection.end();
  }
}



async function checkExistingShipment(data, connection) {
  if (!data.data.ml_shipment_id) {
    throw new Error("ml_shipment_id no especificado");
  }

  const queryCheck = `
    SELECT ml_vendedor_id, ml_shipment_id 
    FROM envios 
    WHERE ml_shipment_id = ? AND elim IN (0,52) AND superado = 0 AND didCliente = ?
  `;

  const result = await executeQuery(connection, queryCheck, [
    data.data.ml_shipment_id,
    data.data.didCliente
  ]);

  console.log("🚨 Cantidad de coincidencias:", result.length);

  // Si hay al menos una coincidencia, no insertar
  return result.length > 0;
}


async function insertEnvioFlex(data, company, connection) {
  const envioflex = new EnviosFlex(
    data.data.did,
    data.data.ml_shipment_id,
    data.data.ml_vendedor_id || "",
    data.data.ml_qr_seguridad,
    data.data.didCliente,
    data.data.didCuenta,
    data.data.elim,
    company.did,
    connection,
    data.data.estado_envio || 0
  );

  const resultado = await envioflex.insert();
  logGreen(`Registro insertado con ID: ${resultado.did}`);
  return resultado.did;
}

function validateEnvioData(data) {
  if (
    !data.data ||
    !data.data.enviosDireccionesDestino ||
    !data.data.enviosDireccionesDestino.calle ||
    !data.data.enviosDireccionesDestino.cp
  ) {
    throw new Error("Datos de envío inválidos.");
  }
}

async function handleFulfillment(data, connection, company) {
  const queryCheck = `
    SELECT ml_vendedor_id, ml_shipment_id, estado, did 
    FROM envios 
    WHERE ml_shipment_id = ? AND superado = 0`;

  const result = await executeQuery(connection, queryCheck, [
    data.data.ml_shipment_id,

  ]);

  let estadollega;
  // Establecer estado basado en status_order
  /*if (data.data.status_order === "paid") {
    estadollega = 1;
  } else if (data.data.status_order === "cancelled") {
    estadollega = 8;
  }*/


  // Si no se encontraron resultados, retornar un objeto indicando que no se encontró fulfillment
  if (result.length === 0) {
    console.warn("No se encontraron resultados para el fulfillment."); // Log para advertencia
    return {
      status: false,
      insertId: null, // No hay ID existente
    };
  }

  // Si hay resultados, manejar el estado
  const currentStatus = result[0].estado; // Estado actual
  const newStatus = estadollega; // Nuevo estado que se quiere establecer
  console.log("Estado actual:", currentStatus, "Nuevo estado:", newStatus);

  // Si el estado actual es el mismo que el nuevo, cortar el proceso
  if (currentStatus === newStatus) {
    console.log("El estado es el mismo. Corte del proceso.");
    return {
      status: false,
      insertId: result[0].did, // Retornar el ID existente
    };
  }

  // Si el estado es diferente, continuar con la lógica
  ;
  const envio = new Envios(data.data, company, connection);
  await envio.insert();

  return {
    status: true,
    insertId: result[0].did, // Retornar el ID existente
  };
}

async function insertStandardEnvio(data, company, connection) {
  const envio = new Envios(data.data, company, connection);
  const resultado = await envio.insert();
  logGreen(`Registro insertado con did: ${resultado.did}`);
  return resultado.did;
}

async function processRelatedData(data, insertId, company, connection) {
  // await insertCobranza(data, insertId, company, connection);
  //await insertLogisticaInversa(data, insertId, company, connection);
  await insertObservaciones(data, insertId, company, connection);
  await insertDireccionesDestino(data, insertId, company, connection);
  // await insertDireccionesRemitente(data, insertId, company, connection);

  // Verificar si el estado ha cambiado antes de insertar enviosItems
  const currentStatus = await getCurrentStatus(data, connection);
  const newStatus = data.data.status_order === "paid" ? 1 :
    data.data.status_order === "cancelled" ? 8 :
      null;

  if (newStatus !== null && currentStatus !== newStatus) {
    await insertEnviosItems(data, insertId, company, connection);
  } else {
    console.log("El estado es el mismo. Ignoramos la inserción de enviosItems.");
  }

  await insertOrders(data, insertId, company, connection);

  if (data.data.status_order === "cancelled") {
    await sendToShipmentStateMicroService(company.did, data.data.quien, insertId, 8);
  }

  if (data.data.status_order === "paid") {
    console.log("Enviando a microservicio con estado 1");
    await sendToShipmentStateMicroService(company.did, data.data.quien, insertId, 1);
  } else {
    await sendToShipmentStateMicroService(company.did, data.data.quien, insertId, 1);
  }

  logPurple("FINAL");
}

async function getCurrentStatus(data, connection) {
  const queryCheck = `
    SELECT estado 
    FROM envios 
    WHERE ml_venta_id = ? AND ml_pack_id = ? AND superado = 0`;

  const result = await executeQuery(connection, queryCheck, [
    data.data.ml_venta_id,
    data.data.ml_pack_id,
  ]);

  return result.length > 0 ? result[0].estado : null;
}

async function insertCobranza(data, insertId, company, connection) {
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
}

async function insertLogisticaInversa(data, insertId, company, connection) {
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
}

async function insertObservaciones(data, insertId, company, connection) {
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
}

async function insertDireccionesDestino(data, insertId, company, connection) {
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
      data.data.enviosDireccionesDestino.latitud || 0,
      data.data.enviosDireccionesDestino.longitud || 0,
      data.data.enviosDireccionesDestino.quien || 0,
      company,
      data.data.enviosDireccionesDestino.destination_comments,
      data.data.enviosDireccionesDestino.delivery_preference,
      data.data.enviosDireccionesDestino.conHorario,
      data.data.enviosDireccionesDestino.prioridad,
      connection
    );
    await direccionDestino.insert();
  }
}

async function insertDireccionesRemitente(data, insertId, company, connection) {
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
      data.data.enviosDireccionesRemitente.obs || "observaciones light data",
      data.data.enviosDireccionesRemitente.quien,
      company,
      connection
    );
    await direccionRemitente.insert();
  }
}

async function insertEnviosItems(data, insertId, company, connection) {
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
        item.ml_id || "",
        item.dimensions || "",
        item.cantidad,
        item.variacion || "",
        item.seller_sku,
        item.descargado,
        item.autofecha,
        item.superado,
        item.elim,
        company,
        connection
      );
      await enviosItems.insert(); // Asegúrate de que `insert()` esté definido en EnviosItems
    }
  }
}

async function insertOrders(data, insertId, company, connection) {
  if (data.data.ff == 1) {
    let didOrden = 0;
    const orden = new Ordenes({
      did: 0, // Asignar 0 inicialmente, ya que se insertará una nueva orden
      didEnvio: insertId,
      didCliente: data.data.didCliente,
      didCuenta: data.data.didCuenta,
      status: data.data.status_order || "",
      flex: data.data.flex,
      fecha_venta: data.data.fecha_venta || "",
      number: data.data.number || "",
      observaciones: data.observaciones,


      armado: 0,
      descargado: 0,
      fecha_armado: null,
      quien_armado: "0",
      idEmpresa: company.did,
      connection: connection,
    });

    logYellow(`Insertando orden: ${JSON.stringify(orden)}`);
    const resultadoOrden = await orden.insert();

    // Usar el insertId si did es 0, de lo contrario usar did
    didOrden = resultadoOrden.insertId



    console.log("didOrden", didOrden);


    await insertOrderItems(data, data.data.items, didOrden, connection);

  }
}

async function insertOrderItems(data, items, orderId, connection) {
  if (!Array.isArray(items)) {
    console.warn("No se proporcionaron items válidos para insertar.");
    return; // Salir si no hay items
  }
  console.log(orderId, "ORDEERID");

  for (const item of items) {
    const ordenItems = new OrdenesItems(
      orderId, // Usar el ID de la orden que se pasó
      item.codigo,
      item.imagen,
      item.descripcion,
      item.ml_id,
      item.dimensions,
      item.cantidad,
      item.variacion,
      item.seller_sku,
      data.data.lote,
      connection
    );

    const insertIdItems = await ordenItems.insert();
    console.log(`Orden Items insertados con ID: ${insertIdItems.insertId}`);
  }
}




module.exports = {
  AltaEnvio,
};
