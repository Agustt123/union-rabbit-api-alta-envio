const { executeQuery } = require("../dbconfig");

async function checkToken(token, didCliente, connection) {


    if (typeof token !== 'string' || token.length !== 128) {
        return false; // o podés lanzar un error si querés manejarlo distinto
    }


    const query = 'SELECT * FROM clientes WHERE token_api_ext = ? AND did = ?';
    const result = await executeQuery(connection, query, [token, didCliente]);

    if (result.length > 0) {
        return true;
    } else {
        return false;
    }

}

module.exports = { checkToken };