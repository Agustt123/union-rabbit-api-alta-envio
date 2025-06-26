const { getConnection, getFromRedis, executeQuery } = require("../../dbconfig");
const { logYellow, logBlue } = require("../../fuctions/logsCustom");

class Envios {
  constructor(data, company = null, connection = null) {
    this.gtoken = this.generateGToken();
    this.fechaunix = this.generateFechaUnix();

    // Fecha de inicio ajustada
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajustar la hora según sea necesario
    this.fecha_inicio = fecha.toISOString(); // Asignar la fecha en formato ISO

    if (data.estado_envio == "paid") {
      data.estado_envio = 1;
    }
    if (data.estado_envio == "cancelled") {
      data.estado_envio = 0;
    }

    const campos = {
      did: data.did ?? 0,
      didDeposito: data.didDeposito ?? 1,
      flex: data.flex ?? 0,
      turbo: data.turbo ?? 0,
      exterior: data.exterior ?? 0,
      lote: data.lote ?? "",
      ml_shipment_id: data.ml_shipment_id ?? "",
      ml_vendedor_id: data.ml_vendedor_id ?? "",
      ml_venta_id: data.ml_venta_id ?? "",
      ml_pack_id: data.ml_pack_id ?? "",
      ml_qr_seguridad: data.ml_qr_seguridad ?? "",
      didCliente: data.didCliente ?? 0,
      didCuenta: data.didCuenta,
      mode: data.mode ?? "",
      didMetodoEnvio: data.didMetodoEnvio ?? 0,
      didServicio: data.didServicio ?? 1,
      didSucursalDistribucion: data.didSucursalDistribucion ?? 1,
      peso: data.peso ?? "0",
      destination_types: data.destination_types ?? " ",
      estado: data.estado ?? 1,
      // estado_envio: data.estado_envio ?? 0,

      volumen: data.volumen ?? "0",
      bultos: data.bultos ?? 1,
      valor_declarado: data.valor_declarado ?? "0",
      monto_total_a_cobrar: data.monto_total_a_cobrar ?? "0",

      tracking_number: data.tracking_number,
      fecha_venta: data.fecha_venta ?? "",
      destination_receiver_name: data.destination_receiver_name ?? " ",
      destination_receiver_phone: data.destination_receiver_phone ?? " ",
      destination_receiver_email: data.destination_receiver_email ?? " ",


      quien: data.quien ?? 0,
      elim: data.elim ?? 0,
    };

    // Solo asignar si el campo no es null
    for (const [key, value] of Object.entries(campos)) {
      if (value !== null) {
        this[key] = value;
      }
    }

    this.company = company;
    this.connection = connection;
  }

  // Getter para fecha_inicio

  generateGToken() {
    return Math.random().toString(36).substring(2);
  }

  generateFechaUnix() {
    return Math.floor(Date.now() / 1000);
  }

  async insert() {
    try {
      // Establecer elim en 52 si es necesario
      if (this.elim === "") {
        this.elim = 52; // Cambiar a 52 si elim está vacío
      }

      if (this.did === 0 || this.did === "0" || this.did === "") {
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
    const query = "SELECT id FROM envios WHERE did = ?";
    try {
      const results = await executeQuery(connection, query, [this.did]);
      if (results.length > 0) {
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
      }


      else {
        return { insertId, did };
      }
    } catch (error) {
      throw error;
    }
  }



}

module.exports = Envios;
