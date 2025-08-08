const express = require("express");
const FF = express.Router();
const { getCompanyById } = require("../dbconfig");
const { AltaEnvio } = require("../controllerAlta/controllerAltaEnvio");

// POST /altaEnvioFF
FF.post("/altaEnvioFF", async (req, res) => {
    try {
        const data = req.body;
        const dataEnvio = data?.data;

        // Validación de existencia del objeto data
        if (!dataEnvio) {
            return res.status(500).json({
                estado: false,
                error: -1,
                message: `Error en /altaEnvioFF: falta el objeto 'data'`
            });
        }

        // Validación de campos obligatorios raíz
        const camposObligatorios = ['didDeposito', 'didEmpresa', 'didServicio', 'ff'];
        for (const campo of camposObligatorios) {
            if (dataEnvio[campo] === undefined || dataEnvio[campo] === null) {
                return res.status(500).json({
                    estado: false,
                    error: -1,
                    message: `Error en /altaEnvioFF: falta campo obligatorio '${campo}'`
                });
            }
        }

        // Validación de dirección destino
        const direccion = dataEnvio.enviosDireccionesDestino;
        const camposDireccion = ['calle', 'numero', 'cp', 'localidad'];
        for (const campo of camposDireccion) {
            if (!direccion?.[campo]) {
                return res.status(500).json({
                    estado: false,
                    error: -1,
                    message: `Error en /altaEnvioFF: falta campo obligatorio en dirección '${campo}'`
                });
            }
        }

        // Validación de items
        const items = dataEnvio.items;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(500).json({
                estado: false,
                error: -1,
                message: `Error en /altaEnvioFF: se requiere al menos un item en 'items'`
            });
        }
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const camposItem = ['codigo', 'cantidad', 'seller_sku'];
            for (const campo of camposItem) {
                if (item?.[campo] === undefined || item?.[campo] === null) {
                    return res.status(500).json({
                        estado: false,
                        error: -1,
                        message: `Error en /altaEnvioFF: falta campo obligatorio '${campo}' en el item ${i}`
                    });
                }
            }
        }

        // Filtrado de empresas
        const idEmpresa = dataEnvio.didEmpresa;
        const empresasExcluidas = [149, 44, 86, 36];
        if (empresasExcluidas.includes(idEmpresa)) {
            console.log(`idEmpresa ${idEmpresa} está excluida.`);
            return res.status(200).json({ mensaje: `Empresa ${idEmpresa} ignorada.` });
        }

        // Procesamiento solo si es empresa 82

        console.log("Procesando mensaje para idEmpresa :", data);

        const company = await getCompanyById(idEmpresa);
        const result = await AltaEnvio(company, data);

        if (result.estado === false) {
            return res.status(500).json(result);
        }

        return res.status(200).json({ estado: true, mensaje: "Insercion realizada correctamente.", didEnvio: result.didEnvio });


    } catch (error) {
        console.error("Error en /altaEnvioFF:", error);
        return res.status(500).json({ estado: false, error: -1, message: `Error en /altaEnvioFF: ${error.message}` });
    }
});


FF.get("/test", (req, res) => {
    res.status(200).json({ estado: true });
});

module.exports = FF;
