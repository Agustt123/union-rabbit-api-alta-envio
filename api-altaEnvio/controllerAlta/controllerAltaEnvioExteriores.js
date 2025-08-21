
const EnvioExterior = require("../controller/envios/clase-envios-exteriores");
const { getConnection } = require("../dbconfig");






async function envioExterior(data) {
    const connection = await getConnection(data.didEmpresa);
    try {
        const { didLocal, didExterno, cliente, flex, didEmpresa } = data;

        // Validar los datos de entrada
        if (!didLocal || !didExterno || !cliente || !flex) {
            throw new Error("Faltan datos necesarios para crear el envío exterior.");
        }

        // Crear una instancia de EnviosFlex
        const envioExterior = new EnvioExterior(didLocal, didExterno, cliente, flex, didEmpresa, connection);

        // Insertar el envío exterior en la base de datos
        const result = await envioExterior.insert();

        return {
            estado: true,
            mensaje: "Envío exterior creado exitosamente.",
            data: result,
        };
    } catch (error) {
        console.error("Error al crear el envío exterior:", error.message);
        return {
            estado: false,
            error: error.message,
        };

    }
    finally {
        if (connection) {
            connection.end();
        }
    }

}


module.exports = {
    envioExterior
};
