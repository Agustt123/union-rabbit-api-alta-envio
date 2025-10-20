const { getConnection, getFromRedis, executeQuery } = require('../../dbconfig');
const { logYellow, logBlue } = require('../../fuctions/logsCustom');

// Crear la clase
class EnviosFenicio {
    constructor(didEnvio = null, data = "", company = null, connection = null) {
        this.didEnvio = didEnvio;
        this.data = data;
        this.company = company;
        this.connection = connection
        // Asegurarse de que idEmpresa sea siempre un string
    }

    // Método para convertir a JSON
    toJSON() {
        return JSON.stringify(this);
    }

    // Método para insertar en la base de datos
    async insert() {
        const redisKey = 'empresasData';
        console.log("Buscando clave de Redis:", redisKey);

        try {
            if (this.didEnvio === null) {
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

    // Verificar si existe un registro con didEnvio y actualizarlo si es necesario
    async checkAndUpdateDidEnvio(connection) {
        try {

            return this.createNewRecord(connection);

        } catch (error) {
            throw error;
        }
    }

    // Método para crear un nuevo registro en la base de datos
    async createNewRecord(connection) {
        try {
            const columnsQuery = 'DESCRIBE envios_wh_fenicio';
            const results = await executeQuery(connection, columnsQuery, []);

            const tableColumns = results.map((column) => column.Field);
            const filteredColumns = tableColumns.filter((column) => this[column] !== undefined);

            const values = filteredColumns.map((column) => this[column]);
            const insertQuery = `INSERT INTO envios_wh_fenicio (${filteredColumns.join(', ')}) VALUES (${filteredColumns.map(() => '?').join(', ')})`;

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


module.exports = EnviosFenicio;
