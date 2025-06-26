const express = require("express");
const FF = express.Router();
const { getCompanyById } = require("../dbconfig");
const { AltaEnvio } = require("../controllerAlta/controllerAltaEnvio");

// POST /altaEnvioFF
FF.post("/altaEnvioFF", async (req, res) => {
    try {
        const data = req.body;
        const dataEnvio = data?.data;

        // Validación de campos obligatorios
        const camposObligatorios = ['token', 'didDeposito', 'didEmpresa', 'didServicio', 'ff'];
        for (const campo of camposObligatorios) {
            if (!dataEnvio?.[campo] && dataEnvio?.[campo] !== 0) {
                return res.status(500).json({
                    estado: false,
                    error: -1,
                    message: `Error en /altaEnvioFF: falta campo obligatorio '${campo}'`
                });
            }
        }

        const idEmpresa = dataEnvio.didEmpresa;
        const empresasExcluidas = [149, 44, 86, 36];
        if (empresasExcluidas.includes(idEmpresa)) {
            console.log(`idEmpresa ${idEmpresa} está excluida.`);
            return res.status(200).json({ mensaje: `Empresa ${idEmpresa} ignorada.` });
        }

        if (idEmpresa === 82) {
            console.log("Procesando mensaje para idEmpresa :", data);

            const company = await getCompanyById(idEmpresa);
            const result = await AltaEnvio(company, data);
            if (result.estado === false) {
                return res.status(500).json(result);
            }

            return res.status(200).json({ estado: true, mensaje: "Insercion realizada correctamente." });
        } else {
            console.log(`idEmpresa ${idEmpresa} recibida pero no procesada.`);
            return res.status(200).json({ mensaje: "Mensaje recibido pero no procesado." });
        }
    } catch (error) {
        console.error("Error en /altaEnvioFF:", error);
        return res.status(500).json({ estado: false, error: -1, message: `Error en /altaEnvioFF: ${error.message}` });
    }
});

FF.get("/test", (req, res) => {
    res.status(200).json({ estado: true });
});

module.exports = FF;
