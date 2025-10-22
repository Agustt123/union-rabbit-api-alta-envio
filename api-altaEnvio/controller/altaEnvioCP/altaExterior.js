
const EnvioExterior = require("../envios/clase-envios-exteriores");
const { getConnection } = require("../../dbconfig");









async function envioExterior(didLocal, didExterno, cliente, flex, didEmpresa) {
    const connection = await getConnection(didEmpresa);
    try {


        console.log(didLocal, didExterno, cliente, flex, "holaaa");

        if (!didLocal || !didExterno || !cliente) {
            throw new Error("Faltan datos necesarios para crear el envío exterior.");
        }

        const envioExterior = new EnvioExterior(didLocal, didExterno, cliente, flex, didEmpresa, connection);


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
