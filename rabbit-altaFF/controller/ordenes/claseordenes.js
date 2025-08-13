const { getConnection, getFromRedis, executeQuery } = require("../../dbconfig");
const { logYellow, logBlue } = require("../../fuctions/logsCustom");

// Clase Ordenes
class Ordenes {
  constructor({
    did = "",
    didEnvio = "",
    didCliente = "",
    didCuenta = "",
    status = "",
    flex = 0,
    fecha_venta = null,
    number = "",
    observaciones = "",
    armado = 0,
    descargado = 0,
    fecha_armado = null,
    quien_armado = "",
    connection = null,
  }) {
    this.did = did;
    this.didEnvio = didEnvio;
    this.didCliente = didCliente;
    this.didCuenta = didCuenta;
    this.status = status;
    this.flex = flex;
    this.fecha_venta = fecha_venta;
    this.number = number;
    this.observaciones = observaciones || "Observación por defecto"; // Valor por defecto
    this.armado = armado;
    this.descargado = descargado;
    this.fecha_armado = fecha_armado;
    this.quien_armado = quien_armado;
    this.connection = connection;
  }

  // Método para convertir a JSON
  toJSON() {
    return {
      did: this.did,
      didEnvio: this.didEnvio,
      didCliente: this.didCliente,
      didCuenta: this.didCuenta,
      status: this.status,
      flex: this.flex,
      fecha_venta: this.fecha_venta,
      number: this.number,
      observaciones: this.observaciones,
      armado: this.armado,
      descargado: this.descargado,
      fecha_armado: this.fecha_armado,
      quien_armado: this.quien_armado,
      // ❌ no incluyas `this.connection` porque puede tener referencias cíclicas o funciones internas
    };
  }

  // Método para insertar en la base de datos
  async insert() {
    try {
      return this.checkAndUpdateDid(this.connection);
    } catch (error) {
      console.error("Error en el método insert:", error.message);
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
    try {
      const checkDidQuery =
        "SELECT number, status, flex, did, didEnvio FROM ordenes WHERE number = ? AND didCliente = ? AND superado = 0 AND elim = 0";
      const results = await executeQuery(connection, checkDidQuery, [
        this.number,
        this.didCliente
      ]);

      if (results.length > 0) {
        this.didEnvio = results[0].didEnvio; // ← corregido a asignación

        if (
          results[0].status != this.status &&
          results[0].flex == this.flex &&
          results[0].number == this.number
        ) {
          const updateQuery =
            "UPDATE ordenes SET superado = 1 WHERE number = ?";
          await executeQuery(connection, updateQuery, [this.number]);

          return this.createNewRecord(connection, results[0].did);
        }

        return {
          insertId: results[0].number,
          did: results[0].number,
          message: "Registro no actualizado",
        };
      } else {
        return this.createNewRecord(connection);
      }
    } catch (error) {
      throw error;
    }
  }

  async createNewRecord(connection, did) {
    try {
      const columnsQuery = "DESCRIBE ordenes";
      const results = await executeQuery(connection, columnsQuery, []);

      const tableColumns = results.map((column) => column.Field);
      const filteredColumns = tableColumns.filter(
        (column) => this[column] !== undefined
      );
      const values = filteredColumns.map((column) => this[column]);
      const insertQuery = `INSERT INTO ordenes (${filteredColumns.join(
        ", "
      )}) VALUES (${filteredColumns.map(() => "?").join(", ")})`;

      logYellow("Insert Query", insertQuery);
      logBlue("Values:", values);

      const insertResult = await executeQuery(
        connection,
        insertQuery,
        values
      );

      if (!did) {
        logYellow("Insert Result", insertResult);

        const updateQuery = "UPDATE ordenes SET did = ? WHERE id = ?";
        await executeQuery(connection, updateQuery, [
          insertResult.insertId,
          insertResult.insertId,
        ]);

        return {
          insertId: insertResult.insertId,
          did: insertResult.insertId,
          message: "Registro insertado correctamente",
        };
      } else {
        console.log("did", did, "insertResult", insertResult);

        const updateQuery = "UPDATE ordenes SET did = ? WHERE id = ?";
        await executeQuery(connection, updateQuery, [did, insertResult.insertId]);

        return {
          insertId: did,
          did: did,
          message: "Registro insertado y actualizado correctamente",
        };
      }
    } catch (error) {
      throw error;
    }
  }
}


module.exports = Ordenes;
