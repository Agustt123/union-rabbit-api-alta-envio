const { getConnection, getFromRedis, executeQuery } = require("../../dbconfig");
const { logYellow, logBlue } = require("../../fuctions/logsCustom");

class EnviosBasico {
    constructor(data, company = null, connection = null) {
        const {
            did = 0,
            didDeposito = 1,
            gtoken = this.generateGToken(),
            flex = 0,
            turbo = 0,
            exterior = 0,


            fechaunix = this.generateFechaUnix(),
            lote = "altaEnvioM",
            ml_shipment_id = "",
            ml_vendedor_id = "",
            ml_venta_id = "",
            ml_pack_id = "-",
            ml_qr_seguridad = "",
            didCliente = 0,
            didCuenta,

            choferAsignado = 0,



            deadline = "",

            pais = null,




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



        let fechaDeadlineRaw = deadline || new Date().toLocaleDateString("es-AR");
        let partesFecha = fechaDeadlineRaw.split("/");
        this.estimated_delivery_time_date = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]}`;





        this.fechaunix = fechaunix;
        this.lote = lote;
        this.ml_shipment_id = ml_shipment_id;
        this.ml_vendedor_id = ml_vendedor_id;
        this.ml_venta_id = ml_venta_id;
        this.ml_pack_id = ml_pack_id;
        this.ml_qr_seguridad = ml_qr_seguridad;
        this.didCliente = didCliente;
        this.didCuenta = didCuenta;

        this.choferAsignado = choferAsignado;



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


            if (this.did === 0 || this.did === "0") {
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
module.exports = EnviosBasico;
