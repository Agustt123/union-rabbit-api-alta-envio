const { getConnection, getFromRedis, executeQuery } = require('../../dbconfig');
const { logYellow, logBlue } = require('../../fuctions/logsCustom');

// Crear la clase
class EnvioExterior {
    constructor(didLocal = "", didExterno = "", cliente = "", flex = "", didEmpresa = null, connection = null) {
        this.didLocal = didLocal;
        this.didExterno = didExterno || "";
        this.cliente = cliente || "";
        this.flex = flex || 0
        this.didEmpresa = didEmpresa;
        this.connection = connection;

    }

    // Método para convertir a JSON
    toJSON() {
        return JSON.stringify(this);
    }

    // Método para insertar en la base de datos
    async insert() {
        try {

            return this.checkAndUpdateDidEnvio(this.connection);
        }
        catch (error) {
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
            const checkDidEnvioQuery = 'SELECT id FROM envios_exteriores WHERE didExterno = ?';
            const results = await executeQuery(connection, checkDidEnvioQuery, [this.didExterno]);

            if (results.length > 0) {
                // Si `didEnvio` ya existe, actualizarlo
                const updateQuery = 'UPDATE envios_exteriores SET superado = 1 WHERE didExterno = ?';
                await executeQuery(connection, updateQuery, [this.didExterno]);

                // Crear un nuevo registro con el mismo `didEnvio`
                return this.createNewRecord(connection);
            } else {
                // Si `didEnvio` no existe, crear un nuevo registro directamente
                return this.createNewRecord(connection);
            }
        } catch (error) {
            throw error;
        }
    }

    async createNewRecord(connection) {
        try {
            const columnsQuery = 'DESCRIBE envios_exteriores';
            const results = await executeQuery(connection, columnsQuery, []);

            const tableColumns = results.map((column) => column.Field);
            const filteredColumns = tableColumns.filter((column) => this[column] !== undefined);

            const values = filteredColumns.map((column) => this[column]);
            const insertQuery = `INSERT INTO envios_exteriores (${filteredColumns.join(', ')}) VALUES (${filteredColumns.map(() => '?').join(', ')})`;



            logYellow("Insert Query", insertQuery);
            logBlue("Values:", values);

            const insertResult = await executeQuery(connection, insertQuery, values);

            const resultId = insertResult.insertId;



            return { insertId: insertResult.insertId };
        } catch (error) {
            throw error;
        }
    }

}

module.exports = EnvioExterior;
