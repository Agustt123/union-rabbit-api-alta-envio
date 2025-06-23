const { getConnection, getFromRedis, executeQuery } = require("../../dbconfig");
const { logYellow, logBlue } = require("../../fuctions/logsCustom");
const Ordenes = require("./claseordenes");

// Clase EnviosDireccionesRemitente
class OrdenesItems {
  constructor(
    didOrden = "",
    codigo = "",
    imagen = "",
    descripcion = "",
    ml_id = "",
    dimensiones = "",
    cantidad = 0,
    variacion = "",
    seller_sku = "",
    connection = null
  ) {
    this.didOrden = didOrden;
    this.codigo = codigo;
    this.imagen = imagen;
    this.descripcion = descripcion;
    this.ml_id = ml_id;
    this.dimensiones = dimensiones;
    this.cantidad = cantidad;
    this.variacion = variacion;
    this.seller_sku = seller_sku;
    this.connection = connection; // Asegurándose de que idEmpresa sea siempre un string
  }

  // Método para convertir a JSON
  toJSON() {
    return JSON.stringify(this);
  }

  // Método para insertar en la base de datos
  async insert() {
    try {
      if (
        this.didOrden === null ||
        this.didOrden === undefined ||
        this.didOrden === "" ||
        this.didOrden === 0
      ) {
        // Si `didEnvio` es null, crear un nuevo registro
        return this.createNewRecord(this.connection);
      } else {
        // Si `didEnvio` no es null, verificar si ya existe y manejarlo
        return this.checkAndUpdateDidEnvio(this.connection);
      }
    } catch (error) {
      console.error("Error en el método insert:", error.message);

      // Lanzar un error con el formato estándar
      throw {
        status: 500,
        response: {
          estado: false,
          error: -1,
        },
      };
    }
  }

  async checkAndUpdateDidEnvio(connection) {
    try {
      const checkDidEnvioQuery =
        "SELECT id,didOrden FROM ordenes_items WHERE didOrden = ?";
      const results = await executeQuery(connection, checkDidEnvioQuery, [
        this.didOrden,
      ], true);
      console.log(results, "dsa");

      if (results.length > 0) {
        // Si `didEnvio` ya existe, actualizarlo
        const updateQuery =
          "UPDATE ordenes_items SET superado = 1 WHERE didOrden = ?";
        await executeQuery(connection, updateQuery, [results[0].didOrden]);

        // Crear un nuevo registro con el mismo `didEnvio`
        return this.createNewRecord(connection, results[0].didOrden);
      } else {
        // Si `didEnvio` no existe, crear un nuevo registro directamente
        return this.createNewRecord(connection, this.didOrden);
      }
    } catch (error) {
      throw error;
    }
  }

  async createNewRecord(connection, didOrden) {
    try {
      const columnsQuery = "DESCRIBE ordenes_items";
      const results = await executeQuery(connection, columnsQuery, []);

      const tableColumns = results.map((column) => column.Field);
      const filteredColumns = tableColumns.filter(
        (column) => this[column] !== undefined
      );

      const values = filteredColumns.map((column) => this[column]);
      const insertQuery = `INSERT INTO ordenes_items (${filteredColumns.join(
        ", "
      )}) VALUES (${filteredColumns.map(() => "?").join(", ")})`;



      const insertResult = await executeQuery(connection, insertQuery, values);


      const updateQuery = "UPDATE ordenes_items SET didOrden= ? WHERE  id = ?";
      await executeQuery(connection, updateQuery, [
        didOrden,
        insertResult.insertId,
      ]);
      return { insertId: insertResult.insertId };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = OrdenesItems;
