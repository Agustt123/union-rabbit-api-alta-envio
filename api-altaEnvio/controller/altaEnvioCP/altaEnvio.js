const EnviosBasico = require("../envios/clase-alta-basica");


async function altaEnvioBasica(connection, body, company) {

    const data = {
        didCliente: body.clientId,
        didCuenta: body.accountId,
        flex: body.flex,
        externo: body.externo,
        quien: body.userId,
        choferAsignado: body.dirverId,
        ml_qr_seguridad: JSON.stringify(body.dataQr), //body.dataQr,
        idEmpresa: body.companyId
    }


    const envio = new EnviosBasico(data, company, connection)
    const result = await envio.insert();
    return { didEnvio: result.did }
};


module.exports = {
    altaEnvioBasica
};