const { redisClient } = require("../dbconfig");

async function actualizarCacheEnvio(
    didEmpresa,
    didEnvio,
    estado,
    chofer
) {
    const empresa = String(didEmpresa);
    const envio = String(didEnvio);

    const MAIN_KEY = "sCache"; // clave principal
    const fieldKey = `ld:asig:${empresa}:${envio}`;

    const TTL_24_HS = 24 * 60 * 60;
    const now = Date.now();

    const value = JSON.stringify({
        estado: String(estado),
        chofer: String(chofer ?? -1),
        updatedAt: now
    });

    // Guardamos dentro del hash principal
    await redisClient.hSet(MAIN_KEY, fieldKey, value);

    // TTL para todo el cache
    await redisClient.expire(MAIN_KEY, TTL_24_HS);
}

module.exports = {
    actualizarCacheEnvio
};
