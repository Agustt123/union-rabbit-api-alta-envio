// lightdata-tools-replacement.cjs
// CommonJS. Reemplazo de "LightdataORM" sin dependencias propias.
// Usa mysql2/promise (pool pasado por parámetro) y respeta la API
// original, agregando opciones para columnas clave (idColumn / matchColumn / groupByColumn).

const mysql = require('mysql2/promise');
const { executeQuery } = require('../../dbconfig');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function executeTransaction(db, fn) {
    // Detecta si es pool (tiene getConnection) o conexión directa (tiene beginTransaction)
    let conn = db;
    let mustRelease = false;

    if (db && typeof db.getConnection === 'function') {
        // Pool
        conn = await db.getConnection();
        mustRelease = typeof conn.release === 'function';
    } else if (!db || typeof db.beginTransaction !== 'function') {
        throw new Error('dbConnection no es un pool ni una conexión válida (falta beginTransaction/getConnection)');
    }

    // Comenzar TX (soporta promesa o callback)
    await new Promise((resolve, reject) => {
        const ret = conn.beginTransaction((err) => (err ? reject(err) : resolve()));
        if (ret && typeof ret.then === 'function') ret.then(resolve).catch(reject);
    });

    try {
        const res = await fn(conn);

        await new Promise((resolve, reject) => {
            const ret = conn.commit((err) => (err ? reject(err) : resolve()));
            if (ret && typeof ret.then === 'function') ret.then(resolve).catch(reject);
        });

        return res;
    } catch (e) {
        try {
            await new Promise((resolve, reject) => {
                const ret = conn.rollback((err) => (err ? reject(err) : resolve()));
                if (ret && typeof ret.then === 'function') ret.then(resolve).catch(reject);
            });
        } catch (_) { } // ignorar rollback fallido
        throw e;
    } finally {
        if (mustRelease) conn.release();
    }
}


async function getTableColumns(db, table) {
    const sql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
    ORDER BY ORDINAL_POSITION
  `;
    const rows = await executeQuery(db, sql, [table]);
    return rows.map(r => r.COLUMN_NAME);
}

function ensureArray(x) { return Array.isArray(x) ? x : [x]; }

// Construye listas para INSERT ... SELECT, forzando valores para quien/superado/elim
function buildInsertSelectLists({
    allColumns,
    forceValues = {}, // { quien: '?', elim: '1', superado: '0' }
    exclude = ['id', 'autofecha'],
}) {
    const insertCols = [];
    const selectExprs = [];

    const has = (c) => allColumns.includes(c);

    for (const col of allColumns) {
        if (exclude.includes(col)) continue;

        if (Object.prototype.hasOwnProperty.call(forceValues, col)) {
            insertCols.push(col);
            selectExprs.push(`${forceValues[col]} AS ${col}`);
            continue;
        }

        insertCols.push(col);
        selectExprs.push(col);
    }

    for (const [k, v] of Object.entries(forceValues)) {
        if (!has(k)) {
            insertCols.push(k);
            selectExprs.push(`${v} AS ${k}`);
        }
    }

    return { insertCols, selectExprs };
}

// Genera subconsulta para tomar la última versión por groupByColumn
function latestSubquery({ table, groupByColumn, pkColumn = 'id', extraWhere = '' }) {
    const where = extraWhere ? `AND ${extraWhere}` : '';
    return `(
    SELECT MAX(${pkColumn}) AS ${pkColumn}
    FROM ${table}
    WHERE 1=1 ${where ? ` ${where}` : ''}
    GROUP BY ${groupByColumn}
  ) ult`;
}

class LightdataORM {
    // ---------------------------------------------------------------------------
    // SELECT
    // ---------------------------------------------------------------------------
    static async select({
        dbConnection,
        table,
        column,
        value,
        columns,
        values,
        throwExceptionIfAlreadyExists = false,
        throwExceptionIfNotExists = false,
        select = '*',
        extraWhere = '', // ej: 'AND algo = 1'
    }) {
        if (!dbConnection || !table) throw new Error('Parámetros inválidos en select');

        let whereClauses = [];
        let params = [];

        if (Array.isArray(columns) && Array.isArray(values)) {
            if (columns.length !== values.length) {
                const e = new Error('columns y values deben tener misma longitud');
                e.status = 400; throw e;
            }
            whereClauses = columns.map(c => `${c} = ?`);
            params = values;
        } else if (column) {
            whereClauses = [`${column} = ?`];
            params = [value];
        } else {
            const e = new Error("Debes proporcionar 'column' y 'value' o 'columns' y 'values'");
            e.status = 400; throw e;
        }

        const whereSql = whereClauses.join(' AND ');
        const sql = `
      SELECT ${select}
      FROM ${table}
      WHERE ${whereSql}
        AND (COALESCE(superado,0) = 0)
        AND (COALESCE(elim,0) = 0)
      ${extraWhere ? ` ${extraWhere}` : ''}
    `;

        const result = await executeQuery(dbConnection, sql, params);

        if (throwExceptionIfAlreadyExists && result.length > 0) {
            const details = columns ? columns.map((c, i) => `${c}=${values[i]}`).join(', ') : `${column}=${value}`;
            const e = new Error(`Ya existe un registro en ${table} con ${details}`);
            e.status = 409; throw e;
        }

        if (throwExceptionIfNotExists && result.length === 0) {
            const details = columns ? columns.map((c, i) => `${c}=${values[i]}`).join(', ') : `${column}=${value}`;
            const e = new Error(`${details} no encontrado en la tabla ${table}`);
            e.status = 404; throw e;
        }

        return result;
    }

    // ---------------------------------------------------------------------------
    // INSERT (uno o varios) + set did = id si corresponde
    // ---------------------------------------------------------------------------
    static async insert({ dbConnection, table, data, quien }) {
        if (!dbConnection || !table || !data || !quien) throw new Error('Parámetros inválidos en insert');
        const list = Array.isArray(data) ? data : [data];

        const cols = await getTableColumns(dbConnection, table);
        const exclude = ['id', 'autofecha'];

        const usableCols = cols.filter(c => !exclude.includes(c));

        const rowValues = [];
        const placeholders = `(${usableCols.map(() => '?').join(', ')})`;

        for (const obj of list) {
            for (const col of usableCols) {
                if (col === 'quien') rowValues.push(quien);
                else if (col === 'superado') rowValues.push(0);
                else if (col === 'elim') rowValues.push(0);
                else rowValues.push(obj[col] ?? null);
            }
        }

        const sql = `
      INSERT INTO ${table} (${usableCols.join(', ')})
      VALUES ${list.map(() => placeholders).join(', ')}
    `;

        const res = await executeQuery(dbConnection, sql, rowValues);
        const firstId = res.insertId ?? null;
        const count = res.affectedRows ?? list.length;

        // Si existe columna did, seteamos did = id
        if (cols.includes('did') && firstId != null) {
            const ids = Array.from({ length: count }, (_, i) => firstId + i);
            const up = `UPDATE ${table} SET did = id WHERE id IN (${ids.map(() => '?').join(', ')})`;
            await executeQuery(dbConnection, up, ids);
            return ids;
        }

        return { insertId: firstId, affectedRows: count };
    }

    // ---------------------------------------------------------------------------
    // UPDATE versionado por did
    // ---------------------------------------------------------------------------
    static async update({ dbConnection, table, did, data, quien }) {
        if (!dbConnection || !table || !did || !data || !quien) throw new Error('Parámetros inválidos en update');

        return executeTransaction(dbConnection, async (conn) => {
            await executeQuery(conn, `UPDATE ${table} SET superado = 1 WHERE did = ? AND elim = 0 AND superado = 0`, [did]);

            const all = await getTableColumns(conn, table);
            const exclude = ['id', 'autofecha'];
            const cols = all.filter(c => !exclude.includes(c));

            const insCols = []; const vals = [];
            for (const col of cols) {
                if (col === 'did') { insCols.push('did'); vals.push(did); continue; }
                if (col === 'quien') { insCols.push('quien'); vals.push(quien); continue; }
                if (col === 'superado') { insCols.push('superado'); vals.push(0); continue; }
                if (col === 'elim') { insCols.push('elim'); vals.push(0); continue; }
                if (Object.prototype.hasOwnProperty.call(data, col)) { insCols.push(col); vals.push(data[col]); }
            }

            if (insCols.length === 0) throw new Error(`No se encontraron columnas válidas para insertar en ${table}`);

            const sql = `INSERT INTO ${table} (${insCols.join(', ')}) VALUES (${insCols.map(() => '?').join(', ')})`;
            const res = await executeQuery(conn, sql, vals);
            return res.insertId;
        });
    }

    // ---------------------------------------------------------------------------
    // DELETE versionado por did (tabla con columna did)
    // ---------------------------------------------------------------------------
    static async delete({ dbConnection, table, did, quien }) {
        if (!dbConnection || !table || !did || !quien) throw new Error('Parámetros inválidos en delete');
        const dids = Array.isArray(did) ? did : [did];
        const placeholders = dids.map(() => '?').join(', ');
        const activeCountRows = await executeQuery(
            dbConnection,
            `SELECT COUNT(1) AS c
     FROM ${table}
    WHERE did IN (${placeholders})
      AND COALESCE(elim,0)=0
      AND COALESCE(superado,0)=0`,
            dids
        );
        if ((activeCountRows?.[0]?.c ?? 0) === 0) return 0;


        return executeTransaction(dbConnection, async (conn) => {
            const placeholders = dids.map(() => '?').join(', ');
            await executeQuery(conn, `UPDATE ${table} SET superado = 1 WHERE did IN (${placeholders}) AND superado = 0 AND elim = 0`, dids);

            const allCols = await getTableColumns(conn, table);
            const { insertCols, selectExprs } = buildInsertSelectLists({
                allColumns: allCols,
                forceValues: { quien: '?', superado: '0', elim: '1' },
                exclude: ['id', 'autofecha'],
            });

            const latest = latestSubquery({ table, groupByColumn: 'did', pkColumn: 'id', extraWhere: `did IN (${placeholders}) AND COALESCE(elim,0)=0` });

            const sql = `
        INSERT INTO ${table} (${insertCols.join(', ')})
        SELECT ${selectExprs.join(', ')}
        FROM ${table} e
        JOIN ${latest} ON ult.id = e.id
      `;

            const params = [quien, ...dids];
            const res = await executeQuery(conn, sql, params);
            return res.affectedRows ?? 0;
        });
    }

    // ---------------------------------------------------------------------------
    // DELETE genérico por columna (para tablas sin did, p.ej. envios_historial)
    //   matchColumn: por qué columna filtrás (p.ej. didEnvio)
    //   matchValues: valores (array o single)
    //   groupByColumn: cómo agrupás la versión (p.ej. didEnvio)
    // ---------------------------------------------------------------------------
    static async deleteManyBy({ dbConnection, table, matchColumn, matchValues, quien, groupByColumn, pkColumn = 'id' }) {
        if (!dbConnection || !table || !matchColumn || !matchValues || !quien || !groupByColumn) {
            throw new Error('Parámetros inválidos en deleteManyBy');
        }

        const vals = Array.isArray(matchValues) ? matchValues : [matchValues];
        if (vals.length === 0) return 0;
        const placeholders = vals.map(() => '?').join(', ');
        const activeCountRows = await executeQuery(
            dbConnection,
            `SELECT COUNT(1) AS c
     FROM ${table}
    WHERE ${matchColumn} IN (${placeholders})
      AND COALESCE(elim,0)=0
      AND COALESCE(superado,0)=0`,
            vals
        );
        if ((activeCountRows?.[0]?.c ?? 0) === 0) return 0;


        return executeTransaction(dbConnection, async (conn) => {
            const placeholders = vals.map(() => '?').join(', ');

            await executeQuery(conn,
                `UPDATE ${table} SET superado = 1 WHERE ${matchColumn} IN (${placeholders}) AND superado = 0 AND elim = 0`,
                vals
            );

            const allCols = await getTableColumns(conn, table);
            const { insertCols, selectExprs } = buildInsertSelectLists({
                allColumns: allCols,
                forceValues: { quien: '?', superado: '0', elim: '1' },
                exclude: ['id', 'autofecha'],
            });

            const latest = latestSubquery({
                table,
                groupByColumn,
                pkColumn,
                extraWhere: `${matchColumn} IN (${placeholders}) AND COALESCE(elim,0)=0`,
            });

            const sql = `
        INSERT INTO ${table} (${insertCols.join(', ')})
        SELECT ${selectExprs.join(', ')}
        FROM ${table} e
        JOIN ${latest} ON ult.${pkColumn} = e.${pkColumn}
      `;

            const params = [quien, ...vals];
            const res = await executeQuery(conn, sql, params);
            return res.affectedRows ?? 0;
        });
    }
}

module.exports = { LightdataORM, executeQuery, executeTransaction };
