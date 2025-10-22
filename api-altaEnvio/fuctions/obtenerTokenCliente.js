const { executeQuery } = require("../dbconfig")

async function obtenerTokenCliente(connection, didCliente) {

    const query = 'SELECT token_api_ext FROM clientes WHERE did = ? and superado = 0 and elim = 0'
    const result = await executeQuery(connection, query, [didCliente])

    if (result.length > 0) {
        return result[0].token_api_ext
    } else {
        return null
    }

}
module.exports = { obtenerTokenCliente }