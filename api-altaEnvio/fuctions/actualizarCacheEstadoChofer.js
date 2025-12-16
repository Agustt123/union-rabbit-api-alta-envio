const { redisClient } = require("../dbconfig");

async function actualizarCacheEnvio(

    didEmpresa,
    didEnvio,
    estado,
    chofer
) {
    const CACHE_KEY = 'sCache';
    const TTL_24_HS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const cacheStr = await redisClient.get(CACHE_KEY);
    let cache = cacheStr ? JSON.parse(cacheStr) : {};

    const empresaKey = String(didEmpresa);
    const envioKey = String(didEnvio);

    // 1️⃣ Limpieza de envíos vencidos
    for (const empresaId of Object.keys(cache)) {
        for (const envioId of Object.keys(cache[empresaId])) {
            const envio = cache[empresaId][envioId];

            if (!envio.updatedAt || now - envio.updatedAt > TTL_24_HS) {
                delete cache[empresaId][envioId];
            }
        }

        // si la empresa quedó vacía, se elimina
        if (Object.keys(cache[empresaId]).length === 0) {
            delete cache[empresaId];
        }
    }

    // 2️⃣ Crear empresa si no existe
    if (!cache[empresaKey]) {
        cache[empresaKey] = {};
    }

    // 3️⃣ Actualizar / insertar envío
    cache[empresaKey][envioKey] = {
        estado,
        chofer: chofer ?? -1, // -1 = desasignación
        updatedAt: now
    };

    // 4️⃣ Guardar todo nuevamente
    await redisClient.set(CACHE_KEY, JSON.stringify(cache));
}
