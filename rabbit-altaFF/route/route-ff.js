const express = require("express");
const FF = express.Router();
const { getCompanyById } = require("../dbconfig");
const { AltaEnvio } = require("../controllerAlta/controllerAltaEnvio");

// POST /altaEnvioFF
FF.post("/altaEnvioFF", async (req, res) => {
    try {
        const data = req.body;
        const idEmpresa = data?.data?.didEmpresa;

        if (!idEmpresa) {
            return res.status(400).json({ error: "Falta didEmpresa en el body." });
        }

        const empresasExcluidas = [149, 44, 86, 36];
        if (empresasExcluidas.includes(idEmpresa)) {
            console.log(`idEmpresa ${idEmpresa} está excluida.`);
            return res.status(200).json({ mensaje: `Empresa ${idEmpresa} ignorada.` });
        }

        if (idEmpresa === 274 || idEmpresa === 270) {
            console.log("Procesando mensaje para idEmpresa 274:", data);

            const company = await getCompanyById(idEmpresa);
            await AltaEnvio(company, data);

            return res.status(200).json({ mensaje: "AltaEnvio procesado correctamente." });
        } else {
            console.log(`idEmpresa ${idEmpresa} recibida pero no procesada.`);
            return res.status(200).json({ mensaje: "Mensaje recibido pero no procesado." });
        }
    } catch (error) {
        console.error("Error en /altaEnvioFF:", error);
        return res.status(500).json({ error: "Error al procesar el alta de envío." });
    }
});
FF.get("/test", (req, res) => {
    res.status(200).json({ estado: true });
});

module.exports = FF;
