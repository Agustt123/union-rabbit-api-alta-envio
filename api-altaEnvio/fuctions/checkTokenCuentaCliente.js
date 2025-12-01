const { executeQuery } = require("../dbconfig");

async function checkTokenClienteCuentaCliente(token, flex, sellerId, connection) {
    // Validación rápida de token
    if (typeof token !== 'string' || token.length !== 128) {
        return null;
    }

    // Buscar cliente por token
    const clienteQuery = `
        SELECT did 
        FROM clientes 
        WHERE token_api_ext = ? AND superado = 0 AND elim = 0
    `;
    const clienteResult = await executeQuery(connection, clienteQuery, [token]);

    if (clienteResult.length === 0) return null;

    const didCliente = clienteResult[0].did;

    // Si no es flex 1 o 2, devolvemos solo el cliente
    if (![1, 2].includes(flex)) {
        return { didCliente, didCuenta: null };
    }

    // Mapeo dinámico de columnas según flex
    const columnaBusqueda = flex === 1 ? "ML_id_vendedor" : "tn_id";

    // Consulta unificada
    const cuentaQuery = `
        SELECT did 
        FROM clientes_cuentas 
        WHERE did_cliente = ? 
        AND elim = 0 
        AND superado = 0 
        AND ${columnaBusqueda} = ?
        AND tipoCuenta = ?
    `;

    const cuentaResult = await executeQuery(connection, cuentaQuery, [
        didCliente,
        sellerId,
        flex
    ]);

    const didCuenta = cuentaResult.length > 0 ? cuentaResult[0].did : null;

    return {
        didCliente,
        didCuenta
    };
}

module.exports = { checkTokenClienteCuentaCliente };
