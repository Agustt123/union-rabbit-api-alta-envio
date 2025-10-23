
const { altaEnvioBasica } = require("../controller/altaEnvioCP/altaEnvio");
const { envioExterior } = require("../controller/altaEnvioCP/altaExterior");
const sendToShipmentStateMicroService = require("../fuctions/sendToshipmentStateMicroservice");


async function altaCP(connection, data, company) {

    const altaEnvio = await altaEnvioBasica(connection, data, company);
    console.log("hola");
    const didEnvio = altaEnvio.didEnvio
    await sendToShipmentStateMicroService(company.did, data.quien, didEnvio, 7);
    if (data.externo == 0) {
        return { estado: true, data: didEnvio }
    }

    console.log("pasamos");
    console.log(didEnvio, data.didExterno, data.clienteEnEmpresaDueña, data.empresaDueña);


    const altaExterna = await envioExterior(didEnvio, data.didExterno, data.NombreClienteEnEmpresaDueña, data.flex, data.empresaDueña);
    return { estado: true, data: didEnvio }



}

module.exports = { altaCP }