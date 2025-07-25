const { getConnection, getFromRedis, executeQuery } = require('../../dbconfig');
const { logYellow, logBlue } = require('../../fuctions/logsCustom');

class EnviosCobranza {
    constructor(didEnvio = null, didCampoCobranza = null, valor = null, quien = null, elim = null, company = null, connection = null) {
        this.didEnvio = didEnvio;
        this.didCampoCobranza = didCampoCobranza;
        this.valor = valor;
        this.quien = quien || 0;
        this.elim = elim || 0;
        this.company = company;
        this.connection = connection
        // Asegurarse de que idEmpresa sea siempre un string
    }


    async insert() {
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

    async checkAndUpdateDidEnvio(connection) {
        try {

            return this.createNewRecord(connection);

        } catch (error) {
            throw error;
        }
    }

    async createNewRecord(connection) {
        try {
            const columnsQuery = 'DESCRIBE envios_cobranzas';
            const results = await executeQuery(connection, columnsQuery, []);

            const tableColumns = results.map((column) => column.Field);
            const filteredColumns = tableColumns.filter((column) => this[column] !== undefined);

            const values = filteredColumns.map((column) => this[column]);
            const insertQuery = `INSERT INTO envios_cobranzas (${filteredColumns.join(', ')}) VALUES (${filteredColumns.map(() => '?').join(', ')})`;


            const insertResult = await executeQuery(connection, insertQuery, values);


            const resultId = insertResult.insertId;



            return { insertId: insertResult.insertId };
        } catch (error) {
            throw error;
        }
    }

}

module.exports = EnviosCobranza;
