
async function deleteShipment(dbConnection, shipmentId, userId) {

    const mod = await import("lightdata-tools");
    // Por si el paquete exporta como default o con nombre:
    const LightdataORM = mod.LightdataORM ?? mod.default?.LightdataORM;

    await LightdataORM.delete({
        dbConnection,
        table: "envios",
        where: { did: shipmentId },
        quien: userId,
        throwIfNotFound: true
    });

    await LightdataORM.delete({
        dbConnection,
        table: "envios_historial",
        where: { didEnvio: shipmentId },
        quien: userId
    });

    await LightdataORM.delete({
        dbConnection,
        table: "envios_asignaciones",
        where: { didEnvio: shipmentId },
        quien: userId
    });



    return {
        success: true,
        message: "Envio eliminado correctamente",
        data: { did: shipmentId },
        meta: { timestamp: new Date().toISOString() },
    };
}

module.exports = { deleteShipment };