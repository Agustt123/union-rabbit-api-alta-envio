const { executeQuery } = require("../dbconfig");

async function checkToken(token, connection) {
    if (typeof token !== 'string' || token.length !== 128) {
        return null; // o podés lanzar un error
    }

    const query = 'SELECT didCliente, didCuenta FROM clientes WHERE token_api_ext = ?';
    const result = await executeQuery(connection, query, [token]);

    if (result.length > 0) {
        return {
            didCliente: result[0].didCliente,
            didCuenta: result[0].didCuenta
        };
    } else {
        return null;
    }
}

module.exports = { checkToken };
