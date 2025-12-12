const { getConnection, getFromRedis, executeQuery } = require("../../dbconfig");
const { logYellow, logBlue } = require("../../fuctions/logsCustom");

class Envios {
  constructor(data, company = null, connection = null) {
    const {
      did = 0,
      didDeposito = 1,
      gtoken = this.generateGToken(),
      flex = 0,
      turbo = 0,
      exterior = 0,

      fecha_inicio = new Date(),
      fechaunix = this.generateFechaUnix(),
      lote = "altaEnvioM",
      ml_shipment_id = "",
      ml_vendedor_id = "",
      ml_venta_id = "",
      ml_pack_id = "-",
      ml_qr_seguridad = "",
      didCliente = 0,
      didCuenta,
      didServicio = 1,
      didSucursalDistribucion = 1,
      peso = "",
      volumen = "",
      bultos = 1,
      valor_declarado = "",
      monto_total_a_cobrar = "",
      choferAsignado = 0,
      tracking_method = "",
      tracking_number = "",
      fecha_venta = "",
      destination_receiver_name = "",
      destination_receiver_phone = "",
      destination_receiver_email = "",
      destination_comments = "   ",
      tamaño = 0,
      fecha_despacho = "",
      deadline = "",
      prioridad = 0,
      conHorario = "00:00:00",
      hora_desde = "00:00:00",
      hora_hasta = "00:00:00",
      pais = null,


      destination_latitude = 0,
      destination_longitude = 0,
      delivery_preference = " ",
      destination_shipping_street_name = " ",
      destination_shipping_street_number = "",
      destination_shipping_address_line = "",
      destination_city_name = "",
      destination_shipping_zip_code = "",
      destination_state_name = "",
      estimated_delivery_time_date = "",
      costo_envio_ml = 0,
      costoActualizado = costo_envio_ml ? 1 : 0,
      fecha_carga = "",
      obs = "",
      quien = 0,
      elim = 0,
    } = data;

    this.did = did;
    this.didDeposito = didDeposito;
    this.gtoken = gtoken;
    this.flex = flex;
    this.turbo = turbo;
    this.exterior = exterior;

    let fechaInicioBase = data.fecha_inicio ? new Date(data.fecha_inicio) : new Date();

    // Resta horas según país
    if (pais == 2) {
      // Argentina: -4 horas
      fechaInicioBase = new Date(fechaInicioBase.getTime() - 4 * 60 * 60 * 1000);
    } else if (pais == 5 || pais == 7 || pais == 8) {
      // Colombia: -5 horas
      fechaInicioBase = new Date(fechaInicioBase.getTime() - 5 * 60 * 60 * 1000);
    } else {
      // Otros países: -3 horas
      fechaInicioBase = new Date(fechaInicioBase.getTime() - 3 * 60 * 60 * 1000);
    }

    this.fecha_inicio = fechaInicioBase.toISOString();

    this.tamaño = tamaño;
    this.costo_envio_ml = costo_envio_ml;

    let fechaDeadlineRaw = deadline || new Date().toLocaleDateString("es-AR");
    let partesFecha = fechaDeadlineRaw.split("/");
    this.estimated_delivery_time_date = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]}`;

    let fechaCargaDate = fecha_carga ? new Date(fecha_carga) : new Date();
    fechaCargaDate.setHours(fechaCargaDate.getHours() - 3);
    this.fecha_carga = fechaCargaDate.toISOString().split("T")[0];

    this.fecha_despacho = fecha_despacho;

    this.fechaunix = fechaunix;
    this.lote = lote;
    this.ml_shipment_id = ml_shipment_id;
    this.ml_vendedor_id = ml_vendedor_id;
    this.ml_venta_id = ml_venta_id;
    this.ml_pack_id = ml_pack_id;
    this.ml_qr_seguridad = ml_qr_seguridad;
    this.didCliente = didCliente;
    this.didCuenta = didCuenta;
    this.didServicio = didServicio;
    this.didSucursalDistribucion = didSucursalDistribucion;
    this.peso = peso;
    this.choferAsignado = choferAsignado;
    this.volumen = volumen;
    this.bultos = bultos;
    this.valor_declarado = valor_declarado;
    this.monto_total_a_cobrar = monto_total_a_cobrar;
    this.tracking_method = tracking_method;
    this.tracking_number = tracking_number;
    this.fecha_venta = fecha_venta;
    this.destination_receiver_name = destination_receiver_name;
    this.destination_receiver_phone = destination_receiver_phone;
    this.destination_shipping_street_name = destination_shipping_street_name;
    this.destination_shipping_street_number = destination_shipping_street_number;
    this.destination_shipping_address_line = destination_shipping_address_line;
    this.destination_city_name = destination_city_name;
    this.destination_shipping_zip_code = destination_shipping_zip_code;
    this.destination_state_name = destination_state_name;
    this.destination_receiver_email = destination_receiver_email;
    this.destination_comments = destination_comments;
    this.destination_latitude = destination_latitude;
    this.destination_longitude = destination_longitude;
    this.delivery_preference = delivery_preference;
    this.obs = obs;
    this.costoActualizado = costoActualizado || 0;
    this.prioridad = prioridad;
    this.conHorario = conHorario;
    this.hora_desde = hora_desde;
    this.hora_hasta = hora_hasta;
    this.quien = quien;
    this.elim = elim;
    this.company = company;
    this.connection = connection;
  }

  generateGToken() {
    return Math.random().toString(36).substring(2);
  }

  generateFechaUnix() {
    return Math.floor(Date.now() / 1000);
  }

  async insert() {
    try {
      this.fecha_despacho = await calcularFechaDespacho(this.didCliente, this.connection);
      // Establecer elim en 52 si es necesario
      if (this.elim === "") {
        this.elim = 52; // Cambiar a 52 si elim está vacío
      }

      if (this.did == 0 || this.did == "0") {
        return this.createNewRecordWithIdUpdate(this.connection);
      } else {
        return this.checkAndUpdateDid(this.connection);
      }
    } catch (error) {
      console.error("Error en insert:", error.message);
      throw {
        status: 500,
        response: {
          estado: false,
          error: -1,
        },
      };
    }
  }

  async checkAndUpdateDid(connection) {
    const query = "SELECT id,fecha_inicio FROM envios WHERE did = ?";
    try {
      const results = await executeQuery(connection, query, [this.did]);
      if (results.length > 0) {

        this.fecha_inicio = results[0].fecha_inicio;


        const updateQuery = "UPDATE envios SET superado = 1 WHERE did = ?";
        await executeQuery(connection, updateQuery, [this.did]);
      }
      return this.createNewRecord(connection, this.did);
    } catch (error) {
      throw error;
    }
  }

  async createNewRecordWithIdUpdate(connection) {
    try {



      const describeQuery = "DESCRIBE envios";
      const results = await executeQuery(connection, describeQuery, []);

      const columns = results.map((col) => col.Field);
      const filteredColumns = columns.filter((col) => this[col] !== undefined);
      const values = filteredColumns.map((col) => this[col]);

      const insertQuery = `INSERT INTO envios (${filteredColumns.join(
        ", "
      )}) VALUES (${filteredColumns.map(() => "?").join(", ")})`;

      logYellow(`Insert Query: ${JSON.stringify(insertQuery)}`);
      logBlue(`Values: ${JSON.stringify(values)}`);

      const result = await executeQuery(connection, insertQuery, values);
      const insertId = result.insertId;

      const updateQuery = "UPDATE envios SET did = ? WHERE id = ?";
      await executeQuery(connection, updateQuery, [insertId, insertId]);

      return { insertId, did: insertId };
    } catch (error) {
      throw error;
    }
  }

  async createNewRecord(connection, did) {
    try {
      const describeQuery = "DESCRIBE envios";
      const results = await executeQuery(connection, describeQuery, []);

      const columns = results.map((col) => col.Field);
      const filteredColumns = columns.filter((col) => this[col] !== undefined);
      const values = filteredColumns.map((col) => this[col]);

      const insertQuery = `INSERT INTO envios (${filteredColumns.join(
        ", "
      )}) VALUES (${filteredColumns.map(() => "?").join(", ")})`;
      const result = await executeQuery(connection, insertQuery, values);
      logYellow(`Insert Query: ${JSON.stringify(insertQuery)}`);
      logBlue(`Values: ${JSON.stringify(values)}`);

      const insertId = result.insertId;
      if (did === 0 || did === "0") {
        const updateQuery = "UPDATE envios SET did = ? WHERE id = ?";

        await executeQuery(connection, updateQuery, [insertId, insertId]);

        return { insertId, did: insertId };
      } else {
        return { insertId, did };
      }
    } catch (error) {
      throw error;
    }
  }

}

async function calcularFechaDespacho(didCliente, connection) {
  let hora;

  // 1. Intentar obtener hora de cierre personalizada del cliente
  const queryCliente = `
  SELECT hora 
  FROM clientes_cierre_ingreso 
  WHERE superado = 0 AND elim = 0 AND didCliente = ?
`;
  const resultCliente = await executeQuery(connection, queryCliente, [didCliente]);

  if (resultCliente.length > 0) {
    hora = resultCliente[0].hora;
  } else {
    // 2. Si no hay, usar configuración global del sistema
    const queryConfig = `
    SELECT config 
    FROM sistema_config 
    WHERE superado = 0 AND elim = 0
  `;
    const resultConfig = await executeQuery(connection, queryConfig, []);
    const config = JSON.parse(resultConfig[0].config);
    hora = config.hora_cierre;
  }

  // 3. Calcular fecha despacho ajustando zona horaria (UTC-3)
  //servidor toma hora bien aca
  const ahora = new Date();


  const horaActual = ahora.getHours();
  const horaCierre = parseInt(hora);

  if (isNaN(horaCierre)) {
    throw new Error("Hora de cierre inválida");
  }
  // aca toma 3 horas adelantado 
  const fechaDespacho = new Date();

  if (horaActual >= horaCierre) {

    fechaDespacho.setDate(fechaDespacho.getDate() + 1);
    // Sumar un día si ya pasó el corte
  }

  const year = fechaDespacho.getFullYear();
  const month = String(fechaDespacho.getMonth() + 1).padStart(2, "0");
  const day = String(fechaDespacho.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
module.exports = Envios;
