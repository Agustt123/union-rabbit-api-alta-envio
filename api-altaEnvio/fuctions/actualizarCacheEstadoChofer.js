const { redisClient } = require("../dbconfig");

async function actualizarCacheEnvioSafe(
    didEmpresa,
    didEnvio,
    estado,
    chofer
) {
    const CACHE_KEY = 'sCache';

    while (true) {
        await redisClient.watch(CACHE_KEY);

        const cacheStr = await redisClient.get(CACHE_KEY);
        let cache = cacheStr ? JSON.parse(cacheStr) : {};

        const empresaKey = String(didEmpresa);
        const envioKey = String(didEnvio);

        if (!cache[empresaKey]) {
            cache[empresaKey] = {};
        }

        cache[empresaKey][envioKey] = {
            estado,
            chofer: chofer ?? -1
        };

        const tx = redis.multi();
        tx.set(CACHE_KEY, JSON.stringify(cache));

        const result = await tx.exec();

        if (result) break; // éxito
    }
}


module.exports = { actualizarCacheEnvioSafe };