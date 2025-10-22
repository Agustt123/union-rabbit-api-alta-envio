const express = require("express");
const router = express.Router();

const EnviosFlex = require("../controller/envios/clase-enviosflex");

const { redisClient, getConnection, getCompanyById } = require("../dbconfig");

const validateData = require("../middleware/middleware");

const validarCamposRequeridos = require("../middleware/json");
const { AltaEnvio } = require("../controllerAlta/controllerAltaEnvio");
const { logRed } = require("../fuctions/logsCustom");
const { checkToken } = require("../fuctions/checkTokenCliente");
const { AltaEnvio2 } = require("../controllerAlta/controllerAltaEnvio2");
const { eliminarEnvio } = require("../funciones/fotoEnvio/eliminarEnvio");
const { getHIstorialEnvioFoto } = require("../funciones/fotoEnvio/getHistorialEnvioFoto");
const { getEnvioFotoByDid } = require("../funciones/fotoEnvio/getByidEnvioFoto");
const { getListadoEnvioFoto } = require("../funciones/fotoEnvio/getListadoEnvioFoto");
const { descargarFoto } = require("../funciones/fotoEnvio/descargarFoto");
const { ListarEnvio } = require("../funciones/listadoEnvio/ListarEnvio");
const { envioExterior } = require("../controllerAlta/controllerAltaEnvioExteriores");
const { deleteShipment } = require("../controller/eliminarEnvio/eliminarEnvio.js");


const camposRequeridos = [
  "data",

  "enviosDireccionesDestino",
  "enviosDireccionesDestino.numero",
  "enviosDireccionesDestino.calle",
  "enviosDireccionesDestino.cp",
  "enviosDireccionesDestino.localidad",
];

router.post("/cargardatos", async (req, res) => {
  const data = req.body;
  console.log(data, "data cargardatos");


  try {
    const company = await getCompanyById(data.data.idEmpresa);

    if (!company || !company.did) {
      return res.status(400).json({
        message: "Empresa no encontrada o inválida.",
        success: false,
      });
    }

    const connection = await getConnection(company.did);



    try {
      const result = await AltaEnvio(company, connection, data);

      if (!result || result.success === false) {
        logRed("Error al cargar los datos:", result);
        return res.status(500).json({
          mensaje: "Error al insertar.",
          estado: false,
          error: result.message,
        });
      }

      res.status(200).json({ estado: true, mensaje: result.insertId, qr: result.dataqr });
    } catch (error) {
      console.error("Error en AltaEnvio:", error);
      res.status(500).json({
        mensaje: "Error al insertar.",
        estado: false,
        error: error.message || error,
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error("Error obteniendo la empresa o la conexión:", error);
    res.status(500).json({
      message: "Error interno al procesar la solicitud.",
      success: false,
      error: error.message || error,
    });
  }
});
router.post("/altaEnvio", async (req, res) => {
  const data = req.body;
  console.log(data, "data cargardatos");


  try {
    const company = await getCompanyById(data.data.idEmpresa);

    if (!company || !company.did) {
      return res.status(400).json({
        message: "Empresa no encontrada o inválida.",
        success: false,
      });
    }

    const connection = await getConnection(company.did);



    try {
      const result = await AltaEnvio2(company, connection, data);

      if (!result || result.success === false) {
        logRed("Error al cargar los datos:", result);
        return res.status(500).json({
          mensaje: "Error al insertar.",
          estado: false,
          error: result.message,
        });
      }

      res.status(200).json({ estado: true, did: result.insertId, qr: result.dataqr, token: result.token, didEmpresa: result.didEmpresa });
    } catch (error) {
      console.error("Error en AltaEnvio:", error);
      res.status(500).json({
        mensaje: "Error al insertar.",
        estado: false,
        error: error.message || error,
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error("Error obteniendo la empresa o la conexión:", error);
    res.status(500).json({
      message: "Error interno al procesar la solicitud.",
      success: false,
      error: error.message || error,
    });
  }
});

router.post("/eliminarEnvio", async (req, res) => {
  const data = req.body;
  const did = data.did
  const userId = data.userId; // Asegúrate de que userId esté incluido en el cuerpo de la solicitud
  const connection = await getConnection(data.idEmpresa);
  try {
    const result = await deleteShipment(connection, did, userId);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
});
router.post("/getListadoEnvios", async (req, res) => {
  const data = req.body;
  console.log(data, "data getListadoEnvios");
  const connection = await getConnection(data.idEmpresa);
  try {
    const result = await ListarEnvio(connection, data);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
});

router.post("/cargamasivanoflex", async (req, res) => {
  const envios = JSON.parse(req.body.envios); // Array de envíos en el nuevo formato
  const empresa = envios[0].idEmpresa;
  const company = await getCompanyById(empresa);
  const connection = await getConnection(company.did);

  try {
    // Suponiendo que la primera empresa es la que se utilizará

    const enviosTransformados = envios.map((envio) => {
      // Crear un objeto data para cada envío
      const data = {
        operador: "flexia",
        TotalaCobrar: envio.TotalaCobrar,
        nombreCliente: envio.nombreCliente,
        codCliente: envio.codCliente,
        didCliente: envio.didCliente,
        destination_receiver_name: envio.destination_receiver_name,
        destination_receiver_email: envio.destination_receiver_email,
        fecha_venta: envio.fechaVenta,
        ml_shipment_id: envio.tracking_number,
        peso: envio.peso,
        destination_receiver_phone: envio.destination_receiver_phone,
        valor_declarado: envio.valor_declarado,
        idEmpresa: envio.idEmpresa,
        // observaciones: envio.observaciones["observaciones"],
        logisticainversa: envio.logisticainversa,
        quien: envio.quien,
        // Agrega otros campos relevantes aquí
        flex: envio.flex || undefined,
        didCuenta: envio.didCuenta || undefined,
        quien: envio.quien || undefined,
        elim: envio.elim || undefined,
        fullfillment: envio.fullfillment || undefined,
        ml_vendedor_id: envio.ml_vendedor_id || undefined,
        ml_qr_seguridad: envio.ml_qr_seguridad || undefined,
        estado: envio.estado, // Valor por defecto
        enviosDireccionesDestino: envio.direcciones_destino,
        enviosObservaciones: envio.observaciones,
        camposExtras: envio.camposExtras,
        //logisticainversa: envio.logisticainversa
      };
      console.log(data, "datadsaddasdsadsadssdadsadsasdsasd");

      // Validar y agregar la dirección de destino

      return { data }; // Retornar el objeto data
    });

    // Llama a AltaEnvio para cada envío transformado
    const resultado = await Promise.all(
      enviosTransformados.map((envio) => AltaEnvio2(company, connection, envio))
    );
    console.log(resultado, "resultado");

    const insertIds = resultado
      .filter((r) => r.success !== false && r.insertId !== undefined)
      .map((r) => r.insertId);

    if (insertIds.length === 0) {
      return res
        .status(500)
        .json({ message: "Error al cargar los datos.", success: false });
    }

    const insertIdsStr = insertIds.join(",");

    res.status(200).json({
      message: "Datos cargados exitosamente.",
      success: true,
      insertIds: insertIdsStr,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
});
router.post("/altaEnvioFlex", async (req, res) => {
  const data = req.body;
  console.log(data, "data cargardatos");


  try {
    const company = await getCompanyById(data.data.idEmpresa);

    if (!company || !company.did) {
      return res.status(400).json({
        message: "Empresa no encontrada o inválida.",
        success: false,
      });
    }

    const connection = await getConnection(company.did);



    try {
      const result = await AltaEnvio2(company, connection, data);

      if (!result || result.success === false) {
        logRed("Error al cargar los datos:", result);
        return res.status(500).json({
          mensaje: "Error al insertar.",
          estado: false,
          error: result.message,
        });
      }

      res.status(200).json({ estado: true, did: result.didEnvio, qr: result.dataqr });
    } catch (error) {
      console.error("Error en AltaEnvio:", error);
      res.status(500).json({
        mensaje: "Error al insertar.",
        estado: false,
        error: error.message || error,
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error("Error obteniendo la empresa o la conexión:", error);
    res.status(500).json({
      message: "Error interno al procesar la solicitud.",
      success: false,
      error: error.message || error,
    });
  }
});
router.post("/altaEnviosExteriores", async (req, res) => {
  const data = req.body;
  console.log(data, "data cargardatos");


  try {

    try {
      const result = await envioExterior(data);
      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});




router.post("/getHistorialFotoEnvio", async (req, res) => {
  const data = req.body;
  const connection = await getConnection(data.idEmpresa);
  console.log(data, "data getListadoFotoEnvio");


  try {
    const result = await getHIstorialEnvioFoto(connection, data);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
});
router.post("/getListadoFotoEnvio", async (req, res) => {
  const data = req.body;
  const connection = await getConnection(data.idEmpresa);
  console.log(data, "data getListadoFotoEnvio");


  try {
    const result = await getListadoEnvioFoto(connection, data);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
});
router.post("/getEnvioFotoByDid", async (req, res) => {
  const data = req.body;
  const did = data.did
  const connection = await getConnection(data.idEmpresa);

  try {
    const result = await getEnvioFotoByDid(connection, did);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
});

router.post("/deleteEnvio", async (req, res) => {
  const data = req.body;
  const did = data.did
  const connection = await getConnection(data.idEmpresa);
  try {
    const result = await eliminarEnvio(connection, did);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.end();
  }
})
router.post('/descargarFoto', async (req, res) => {
  const { idEmpresa, did, nombreFoto } = req.body;
  await descargarFoto({ idEmpresa, did, nombreFoto }, res);
});


router.post("/enviosMLredis", async (req, res) => {
  const data = req.body;
  const connection = await getConnection(data.idEmpresa);

  try {
    await connection.beginTransaction();

    const email = data.destination_receiver_email;
    delete data.destination_receiver_email;
    // validateData(data);

    if (email) {
      data.destination_receiver_email = email;
    }

    const newDid = await redisClient.incr("paquete:did");

    const redisKeyEstadosEnvios = `estadosEnviosML`;
    // Asignar el valor de subKey
    const subKey = `${data.ml_vendedor_id}-${data.ml_shipment_id}`;

    // Obtener la fecha actual y restar 3 horas
    let fechaCreacion = new Date();
    fechaCreacion.setHours(fechaCreacion.getHours() - 3);

    // Formatear la fecha y hora como 'YYYY-MM-DD HH:MM:SS'
    let fechaCreacionModificada = fechaCreacion
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // Crear el objeto estadoEnvio
    const estadoEnvio = {
      didEnvio: data.did || newDid,
      didEmpresa: data.idEmpresa,
      estado: data.estado || 1,
      fechaCreacion: fechaCreacionModificada, // Fecha con 3 horas menos
      fechaActualizacion: "",
    };

    // Guardar el estado de envío en la clave del hash en Redis usando hSet
    await redisClient.hSet(
      redisKeyEstadosEnvios,
      subKey,
      JSON.stringify(estadoEnvio)
    );

    // Comentado: Guardar datos en MongoDB
    /*
        const envio = new Envios(data, data.did === undefined || data.did === null ? newDid : data.did);
        const respuesta = await envio.createQuerys();
        const insertedId = await insertarEnMongo(idcola, data.idEmpresa, 1, "Alta paquete", respuesta);
        await actualizarColaExterna(data.idEmpresa, idcola, insertedId);
        */

    // Procesamiento principal
    if (data.flex === 1) {
      const envioflex = new EnviosFlex(
        data.did || newDid,
        data.ml_shipment_id,
        data.ml_vendedor_id,
        data.ml_qr_seguridad,
        data.didCliente,
        data.didCuenta,
        data.elim,
        data.idEmpresa,
        connection

      );
      await envioflex.insert();
      await connection.commit();
    } else {
      // Comentado: Guardar datos en MongoDB
      /*
            if (data.envioscobranza) {
                // Código relacionado con envioscobranza...
            }
            if (data.enviosDireccionesRemitente) {
                // Código relacionado con enviosDireccionesRemitente...
            }
            if (data.enviosLogisticaInversa) {
                // Código relacionado con enviosLogisticaInversa...
            }
            if (data.enviosObservaciones) {
                // Código relacionado con enviosObservaciones...
            }
            if (data.enviosDireccionesDestino) {
                // Código relacionado con enviosDireccionesDestino...
            }
            if (data.enviosItems) {
                // Código relacionado con enviosItems...
            }
            */

      await connection.commit();
    }
    console.log("Envío procesado exitosamente:", newDid);

    return res.status(200).json({
      estado: true,
      didEnvio: newDid,
    });
  } catch (error) {
    console.error("Error durante la inserción:", error);
    await connection.rollback();

    return res.status(500).json({
      estado: false,
      error: -1,
      message: error,
    });
  } finally {
    connection.end();
  }
});

router.get("/", async (req, res) => {
  res.status(200).json({
    estado: true,
    mesanje: "Hola chris",
  });
});


module.exports = router;
