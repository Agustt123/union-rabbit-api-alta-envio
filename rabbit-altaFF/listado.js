const express = require('express');
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Database configuration
const dbConfig = {
    host: 'your_database_host',
    user: 'your_database_user',
    password: 'your_database_password',
    database: 'your_database_name',
};

// Helper functions
function limpiar_insertar(q) {
    if (!q) return q;
    q = q.replace(/'/g, '');    // Remove single quotes
    q = q.replace(/"/g, '');    // Remove double quotes
    q = q.trim();               // Trim whitespace
    q = q.replace(/=/g, '');    // Remove equals signs
    q = q.replace(/\\/g, '');   // Remove backslashes
    return q;
}


function microtime_float() {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds + nanoseconds / 1e9;
}

function fdesarmarcpdesc(cps) {
    if (!cps) return '';
    const Atemp = cps.split(',');
    const Atotalescp = [];
    const Ausados = [];

    for (const cp of Atemp) {
        const trimmedCp = cp.trim();
        if (trimmedCp.includes('-')) {
            const [desde, hasta] = trimmedCp.split('-').map(Number);
            for (let i = desde; i <= hasta; i++) {
                if (!Ausados.includes(i)) {
                    Ausados.push(i);
                    Atotalescp.push(i);
                }
            }
        } else {
            const numCp = Number(trimmedCp);
            if (!Ausados.includes(numCp)) {
                Ausados.push(numCp);
                Atotalescp.push(numCp);
            }
        }
    }

    Atotalescp.sort((a, b) => a - b);
    return Atotalescp.join(',');
}

// Main route handler
app.post('/envios/listados', async (req, res) => {
    const DW_etime_start = microtime_float();
    const hora_inicio = moment().format('YYYY-MM-DD HH:mm:ss');
    const imodulo = "enviosListados";
    let idllamada = -1;
    let estadomodulo = -1;

    try {
        // Database connection
        const connection = await mysql.createConnection(dbConfig);

        // Log process start
        const [result] = await connection.execute(
            "INSERT INTO sistema_procesos_at (proceso, error, hora_inicio, quien) VALUES (?, ?, ?, ?)",
            [imodulo, estadomodulo, hora_inicio, req.session.user]
        );
        idllamada = result.insertId;

        // Check if Excel export is requested
        const excel = req.query.excel ? 1 : 0;
        const procesng = "listadoEnvios";

        // Check session profile
        if (!req.session.perfil) {
            return res.json({ estadoLogin: false });
        }

        // Handle CP management
        let manejacp = true;
        const Acomunas = {};
        if (req.session.configuracion && req.session.configuracion.manejaCP * 1 === 0) {
            manejacp = false;
            const [rows] = await connection.execute(
                "SELECT id, nombre FROM `comunas_habilitadas` WHERE superado=0"
            );
            rows.forEach(row => {
                Acomunas[row.id] = row.nombre;
            });
        }

        // Pagination
        const page = req.body.pagina * 1 || 1;
        let limit = req.body.cantxpagina * 1;
        if (excel === 0 && limit === -1) {
            limit = 999999999999999999;
        }

        // Filters
        let FILTROS = {
            nombrecliente: '',
            zonasdeentrega: '',
            cadete: '',
            nombre: '',
            cp: '',
            estado: -1,
            tracking_number: '',
            idml: '',
            origen: '',
            turbo: '',
            asignado: '',
            logisticaInversa: '',
            fotos: '',
            obs: '',
            deposito: 0,
            tipo_fecha: 0,
            fecha_desde: '',
            fecha_hasta: '',
            domicilio: 0
        };

        if (excel === 0) {
            FILTROS = { ...FILTROS, ...req.body.filtros };
        } else {
            if (req.query.appersand) {
                req.query.nombrecliente = req.query.nombrecliente.replace("-15", "&");
            }
            FILTROS.nombrecliente = req.query.nombrecliente || '';
            FILTROS.zonasdeentrega = req.query.zonasdeentrega || '';
            FILTROS.cadete = req.query.cadete || '';
            FILTROS.nombre = req.query.nombre || '';
            FILTROS.cp = req.query.cp || '';
            FILTROS.estado = req.query.estado || -1;
            FILTROS.tracking_number = req.query.tracking_number || '';
            FILTROS.idml = req.query.idml || '';
            FILTROS.origen = req.query.origen || '';
            FILTROS.turbo = req.query.turbo || '';
            FILTROS.logisticaInversa = req.query.logisticaInversa || '';
            FILTROS.fotos = req.query.fotos || '';
            FILTROS.obs = req.query.obs || '';
            FILTROS.deposito = req.query.deposito || 0;
            FILTROS.tipo_fecha = req.query.tipo_fecha || 0;
            FILTROS.fecha_desde = req.query.fecha_desde || '';
            FILTROS.fecha_hasta = req.query.fecha_hasta || '';
            FILTROS.domicilio = req.query.domicilio || 0;
        }

        // Clients filter
        let clientesINN = '';
        let selectClis = '';
        const Aclientes = {};

        if (FILTROS.nombrecliente) {
            selectClis = ` AND nombre_fantasia LIKE '%${limpiar_insertar(FILTROS.nombrecliente)}%' `;
        }

        const [clientesRows] = await connection.execute(
            `SELECT did, codigo, nombre_fantasia, razon_social, elim AS elimCli FROM clientes WHERE superado=0 ${selectClis}`
        );

        clientesRows.forEach(row => {
            Aclientes[row.did] = [row.codigo, row.nombre_fantasia, row.razon_social, row.elimCli];
            if (selectClis) {
                if (clientesINN) clientesINN += ', ';
                clientesINN += row.did;
            }
        });

        if (clientesINN) {
            clientesINN = ` AND e.didCliente IN (${clientesINN}) `;
        } else if (FILTROS.nombrecliente) {
            clientesINN = " AND 1=2 ";
        }

        // Zones filter
        let zonasIN = '';
        let selectZonas = '';
        const Azonas = {};

        if (FILTROS.zonasdeentrega) {
            if (FILTROS.zonasdeentrega * 1 === 0) {
                zonasIN = " 0 ";
            } else {
                selectZonas = ` AND did IN (${limpiar_insertar(FILTROS.zonasdeentrega)}) `;
            }
        }

        if (!zonasIN) {
            const [zonasRows] = await connection.execute(
                `SELECT did, nombre FROM envios_zonas WHERE superado=0 AND elim=0 ${selectZonas}`
            );

            zonasRows.forEach(row => {
                Azonas[row.did] = row.nombre;
                if (FILTROS.zonasdeentrega) {
                    if (zonasIN) zonasIN += ', ';
                    zonasIN += row.did;
                }
            });
        }

        if (zonasIN) {
            zonasIN = ` AND e.didEnvioZona IN (${zonasIN}) `;
        }

        // Users filter
        const AusuariosEliminados = [];
        let usuariosIN2 = '';
        let selectUser = '';
        const Ausuarios = {};

        if (FILTROS.cadete) {
            const chferTemp = FILTROS.cadete.replace(" ", "%");
            selectUser = ` AND ((CONCAT(nombre, ' ', apellido) LIKE '%${limpiar_insertar(chferTemp)}%' ) OR nombre LIKE '%${limpiar_insertar(FILTROS.cadete)}%' OR apellido LIKE '%${limpiar_insertar(FILTROS.cadete)}%')`;
        }

        const [usuariosRows] = await connection.execute(
            `SELECT did, nombre, apellido, elim FROM sistema_usuarios WHERE superado=0 AND elim=0 ${selectUser}`
        );

        usuariosRows.forEach(row => {
            Ausuarios[row.did] = [row.nombre, row.apellido];
            if (usuariosIN2) usuariosIN2 += ', ';
            usuariosIN2 += row.did;
            if (row.elim === 1) {
                AusuariosEliminados.push(row.did);
            }
        });

        let usuariosIN = "";
        if (usuariosIN2 && FILTROS.cadete) {
            usuariosIN = ` AND ea.operador IN (${usuariosIN2}) `;
        } else if (!usuariosIN && FILTROS.cadete) {
            usuariosIN = "-9999";
        }

        // Additional filters
        let sqlf = "";
        if (FILTROS.nombre) {
            sqlf += ` AND e.destination_receiver_name LIKE '%${FILTROS.nombre}%' `;
        }
        if (FILTROS.cp) {
            sqlf += ` AND ( e.destination_shipping_zip_code LIKE '%${FILTROS.cp}%' OR e.destination_shipping_address_line LIKE '%${FILTROS.cp}%' OR e.destination_city_name LIKE '%${FILTROS.cp}%' )`;
        }
        if (FILTROS.estado != -1) {
            sqlf += ` AND e.estado_envio IN (${FILTROS.estado}) `;
        }
        if (FILTROS.tracking_number) {
            sqlf += ` AND e.ml_shipment_id LIKE '%${FILTROS.tracking_number}%' `;
        }
        if (FILTROS.idml) {
            sqlf += ` AND ( e.ml_venta_id LIKE '%${FILTROS.idml}%' OR e.ml_pack_id LIKE '%${FILTROS.idml}%' )`;
        }
        if (FILTROS.origen) {
            sqlf += ` AND e.flex IN (${FILTROS.origen}) `;
        }
        if (FILTROS.turbo) {
            sqlf += ` AND e.turbo = ${FILTROS.turbo} `;
        }

        // Logistics inverse filter
        let joinLI = '';
        if (FILTROS.logisticaInversa == 0) {
            joinLI = "LEFT JOIN envios_logisticainversa AS LI ON (LI.superado = 0 AND LI.elim = 0 AND LI.didEnvio = e.did)";
            sqlf += " AND LI.didEnvio IS NULL";
        } else if (FILTROS.logisticaInversa == 1) {
            joinLI = "JOIN envios_logisticainversa AS LI ON (LI.superado = 0 AND LI.elim = 0 AND LI.didEnvio = e.did)";
        }

        // Photos filter
        let joinFO = '';
        if (FILTROS.fotos == 0) {
            joinFO = "LEFT JOIN envios_fotos AS FO ON (FO.superado = 0 AND FO.elim = 0 AND FO.didEnvio = e.did)";
            sqlf += " AND FO.didEnvio IS NULL";
        } else if (FILTROS.fotos == 1) {
            joinFO = "JOIN envios_fotos AS FO ON (FO.superado = 0 AND FO.elim = 0 AND FO.didEnvio = e.did)";
        }

        // Observations filter
        if (FILTROS.obs == 0) {
            sqlf += " AND e.obs = '' ";
        } else if (FILTROS.obs == 1) {
            sqlf += " AND e.obs != '' ";
        }

        // Warehouse filter
        let sqldep = "";
        let joinDep = '';
        if (FILTROS.deposito != 0) {
            joinDep = "LEFT JOIN depositos AS DE ON (DE.superado = 0 AND DE.elim = 0 )";
            sqldep = `AND e.didDeposito = '${FILTROS.deposito}'`;
        }

        // Date filters
        const Afechascampos = {
            0: "e.fecha_venta",
            1: "e.fecha_inicio",
            2: "eh2.fecha",
            3: "ea.autofecha",
            4: "e.fecha_despacho",
            5: "eh2.fecha",
            6: "eh2.fecha",
            9: "eh2.fecha",
            15: "eh2.fecha"
        };

        const tipofecha = FILTROS.tipo_fecha * 1;
        let sqlfecha = "";

        if (FILTROS.fecha_desde) {
            if (FILTROS.fecha_hasta) {
                const t1 = moment(FILTROS.fecha_desde, 'DD/MM/YYYY').format('YYYY-MM-DD') + ' 00:00:00';
                const t2 = moment(FILTROS.fecha_hasta, 'DD/MM/YYYY').format('YYYY-MM-DD') + ' 23:59:59';
                sqlfecha = ` AND ${Afechascampos[tipofecha]} BETWEEN '${t1}' AND '${t2}' `;
            } else {
                const temp = moment(FILTROS.fecha_desde, 'DD/MM/YYYY').format('YYYY-MM-DD');
                sqlfecha = ` AND ${Afechascampos[tipofecha]} LIKE '${temp}%'`;
            }
        }

        // Profile restrictions
        let mires = "";
        if (req.session.perfil != 1) {
            if (req.session.perfil == 2) {
                const didespecial = req.session.codigoempleado;
                mires = ` AND e.didCliente IN (${didespecial}) `;
            } else if (req.session.perfil == 3) {
                const didespecial = req.session.user;
                mires = ` AND ea.operador = '${didespecial}' `;
            }
        }

        // Get shipping states
        const AestadosDB = {};
        const [estadosRows] = await connection.execute(
            "SELECT did, estado FROM estados_envios WHERE elim=0"
        );
        estadosRows.forEach(row => {
            AestadosDB[row.did] = row.estado;
        });

        // Prepare main query
        const Adatos = [];
        let totalRegistros = 0;

        const Anameflex = {
            0: "Directo",
            1: "ML",
            2: "TNube",
            3: "Shopify",
            4: "WooCommerce",
            5: "Prestashop",
            6: "VTEX",
            7: "Falabella",
            8: "JumpSeller",
            9: "APER",
            11: "ME1"
        };

        let sqldidexternos = "";
        const AdidUsados = [];

        let campos;
        if (excel == 1) {
            campos = `DISTINCT(e.did), e.didCliente, e.peso, e.ml_vendedor_id, e.ml_shipment_id, 
        DATE_FORMAT(e.fecha_venta,'%d/%m/%Y'), DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i'), 
        e.destination_receiver_name, e.destination_receiver_phone, e.destination_comments, 
        e.destination_shipping_address_line, e.destination_shipping_zip_code, e.destination_city_name, 
        e.destination_state_name, e.destination_latitude, e.destination_longitude, 
        e.lead_time_shipping_method_name, e.ml_venta_id, ea.operador, e.estado_envio, 
        cos.cliente, e.obs, DATE_FORMAT(ea.autofecha,'%d/%m/%Y %H:%i'), 
        DATE_FORMAT(eh2.fecha,'%d/%m/%Y %H:%i'), e.didEnvioZona, e.flex, 
        cos.nameZonaCostoCliente, e.exterior, DATE_FORMAT(eh2.fecha,'%d/%m/%Y %H:%i'), 
        e.destination_receiver_email, cos.chofer, cos.nameZonaCostoChofer, e.ml_qr_seguridad`;
        } else {
            campos = `DISTINCT(e.did), e.didCliente, e.ml_vendedor_id, e.ml_shipment_id, 
        DATE_FORMAT(e.fecha_venta,'%d/%m/%Y %H:%i'), DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i'), 
        e.destination_receiver_name, e.destination_shipping_zip_code, e.estado_envio, 
        e.lead_time_shipping_method_name, DATE_FORMAT(e.estimated_delivery_time_date_72,'%d/%m/%Y'), 
        ml_venta_id, ea.operador, e.didEnvioZona, e.flex, cos.nameZonaCostoCliente, e.exterior, 
        e.destination_shipping_address_line, destination_city_name, turbo, ml_pack_id, e.ml_qr_seguridad`;
        }

        let didce = "";
        let fechasdidicolectas = "";
        const AfechaColecta = {};
        let estadoColecta = "";
        let sqljoin = "AND eh2.elim=0 AND eh2.superado=0 ";

        if (tipofecha == 6) {
            estadoColecta = " AND eh2.estado = 1";
            sqljoin = " ";
        } else if (tipofecha == 9) {
            estadoColecta = " AND eh2.estado = 8";
            sqljoin = " ";
        } else if (tipofecha == 5) {
            estadoColecta = " AND eh2.estado = 0";
            sqljoin = " ";
        } else if (tipofecha == 2) {
            estadoColecta = " AND eh2.estado = 5";
            sqljoin = " ";
        }

        // Main query
        const query = `
      SELECT ${campos}
      FROM envios AS e
      LEFT JOIN costos_envios AS cos ON (cos.didEnvio = e.did AND cos.superado=0)
      LEFT JOIN envios_asignaciones AS ea ON (ea.elim=0 AND ea.superado=0 AND ea.didEnvio = e.did)
      LEFT JOIN envios_historial AS eh2 ON (eh2.didEnvio = e.did ${sqljoin} ${estadoColecta})
      ${joinLI}
      ${joinFO}
      ${joinDep}
      WHERE e.superado=0 AND e.elim=0 ${sqlf} ${mires} ${sqlfecha} ${clientesINN} ${zonasIN} ${usuariosIN} ${sqldep}
      ORDER BY e.id DESC
    `;

        // Execute main query
        const [rows] = await connection.execute(query);

        for (const row of rows) {
            const did = row.did;
            const didCliente = row.didCliente;

            // Skip if already processed
            if (AdidUsados.includes(did)) continue;

            // Get client info
            const clienteInfo = Aclientes[didCliente] || ['', '', '', 0];
            const codigo = clienteInfo[0];
            const nombre_fantasia = clienteInfo[1];
            const elimCli = clienteInfo[3];

            // Get zone info
            let zona = 'Sin zona';
            if (Azonas[row.didEnvioZona]) {
                zona = Azonas[row.didEnvioZona];
            }

            // Get user info
            let didcadete = row.operador || 0;
            let namecadete = "";
            if (didcadete > 0) {
                if (AusuariosEliminados.includes(didcadete)) {
                    namecadete = 'Usuario Eliminado';
                } else {
                    const usuarioInfo = Ausuarios[didcadete] || ['', ''];
                    namecadete = `${usuarioInfo[0]} ${usuarioInfo[1]}`;
                }
            }

            // Apply assigned filter
            if (FILTROS.asignado == 0 && didcadete > 0) continue;
            if (FILTROS.asignado == 1 && didcadete < 1) continue;

            // Apply address type filter
            const direccion = row.destination_shipping_address_line || '';
            const Adirreccion = direccion.split(" ");
            const largo = Adirreccion.length - 1;
            const tipo = Adirreccion[largo];

            let ok = false;
            if (FILTROS.domicilio == 1 && tipo == "(C)") {
                ok = true;
            } else if (FILTROS.domicilio == 2 && tipo == "(R)") {
                ok = true;
            } else if (FILTROS.domicilio == 0) {
                ok = true;
            }

            if (!ok) continue;

            AdidUsados.push(did);

            // Handle CP
            let cp = row.destination_shipping_zip_code;
            if (!manejacp) {
                cp = Acomunas[cp] || cp;
            }

            // Handle external shipments
            if (row.exterior == 1) {
                if (sqldidexternos) sqldidexternos += ",";
                sqldidexternos += did;
            }

            // Get flex name
            const flex = row.flex || 0;
            const flexname = Anameflex[flex] || '';

            // Get cost zone
            let zonacosto = "";
            if (flex == 1) {
                zonacosto = "DIRECTO ML";
            } else {
                zonacosto = row.nameZonaCostoCliente || "Sin Zona";
            }

            if (row.nameZonaCostoCliente) {
                zonacosto = row.nameZonaCostoCliente;
            }

            // Handle turbo flag
            let turboDisplay = flexname;
            if (row.turbo == 1) {
                turboDisplay += " <a style='color:red;'><b>TURBO</b></a>";
            }

            // Handle pack ID
            let ml_venta_id = row.ml_venta_id;
            if (row.ml_pack_id && flex == 1) {
                ml_venta_id = `${row.ml_pack_id} (P)`;
            }

            // Generate QR data for non-ML shipments
            let QR = row.ml_qr_seguridad;
            if (flex != 1) {
                const direc = {
                    local: 1,
                    did: did.toString(),
                    cliente: didCliente,
                    empresa: GLOBAL_empresa_id
                };
                QR = JSON.stringify(direc);
            }

            // Add to results
            if (excel == 0) {
                Adatos.push({
                    did,
                    codigo,
                    flexname: turboDisplay,
                    ml_vendedor_id: ml_venta_id,
                    zonacosto,
                    tracking: row.ml_shipment_id,
                    fechaventa: row.fecha_venta,
                    fechagestionar: row.fecha_inicio,
                    nombre: row.destination_receiver_name,
                    cp,
                    estado_envio: row.estado_envio,
                    didcadete,
                    namecadete,
                    lead_time_shipping_method_name: row.lead_time_shipping_method_name,
                    estimated_delivery_time_date_72: row.estimated_delivery_time_date_72,
                    nombre_fantasia,
                    zona,
                    localidad: row.destination_city_name,
                    qr: QR,
                    elimCli
                });
            } else {
                // Excel export format
                const urltracking = `${GLOBAL_url}/tracking.php?token=${did}d54df4s8a${didCliente}`;

                Adatos.push({
                    did,
                    codigoCliente: codigo,
                    peso: row.peso,
                    mlvendedorid: row.ml_vendedor_id,
                    mlshipmnetid: row.ml_shipment_id,
                    fechaventa: row.fecha_venta,
                    fechagestionar: row.fecha_inicio,
                    nombredestinatario: row.destination_receiver_name,
                    telefonodestinatario: row.destination_receiver_phone,
                    email: row.destination_receiver_email,
                    comentariodestino: row.destination_comments,
                    direccion: row.destination_shipping_address_line,
                    cp,
                    localidad: row.destination_city_name,
                    provincia: row.destination_state_name,
                    latitud: row.destination_latitude,
                    longitud: row.destination_longitude,
                    metodoenvio: row.lead_time_shipping_method_name,
                    mlventaid: ml_venta_id,
                    didcadete,
                    namecadete,
                    estado_envio: row.estado_envio,
                    estado_envio_name: AestadosDB[row.estado_envio] || '',
                    razon_social: clienteInfo[2],
                    costoenvio: row.cliente,
                    nombre_fantasia,
                    obs: row.obs,
                    fechaasignacion: row.autofecha,
                    fechaestadoenvio: row.fecha,
                    zonaname: zona,
                    zonacosto,
                    flexname: turboDisplay,
                    urltracking,
                    quienestadoenvio: "",
                    costoChofer: row.chofer,
                    nombreZonaCostoChofer: row.nameZonaCostoChofer,
                    qr: QR
                });
            }

            totalRegistros++;
        }

        // Get external clients info
        if (sqldidexternos) {
            const [externosRows] = await connection.execute(
                `SELECT didLocal, cliente FROM envios_exteriores WHERE superado=0 AND elim=0 AND didLocal IN (${sqldidexternos})`
            );

            const AexternosCLi = {};
            externosRows.forEach(row => {
                AexternosCLi[row.didLocal] = row.cliente;
            });

            for (let i = 0; i < Adatos.length; i++) {
                if (AexternosCLi[Adatos[i].did]) {
                    if (GLOBAL_empresa_id != 114) {
                        Adatos[i].nombre_fantasia += ` ${AexternosCLi[Adatos[i].did]}`;
                    }
                }
            }
        }

        // Get collection dates
        if (fechasdidicolectas) {
            const [colectaRows] = await connection.execute(
                `SELECT didEnvio, DATE_FORMAT(autofecha,'%d/%m/%Y %H:%i') AS fecha 
         FROM envios_historial 
         WHERE elim=0 AND didEnvio IN (${fechasdidicolectas}) AND estado=0`
            );

            colectaRows.forEach(row => {
                AfechaColecta[row.didEnvio] = row.fecha;
            });
        }

        // Get last state dates
        if (fechasdidicolectas) {
            const [estadoRows] = await connection.execute(
                `SELECT didEnvio, DATE_FORMAT(fecha,'%d/%m/%Y %H:%i') AS fecha 
         FROM envios_historial 
         WHERE elim=0 AND didEnvio IN (${fechasdidicolectas}) AND superado=0`
            );

            estadoRows.forEach(row => {
                Aultimoestadofecha[row.didEnvio] = row.fecha;
            });
        }

        // Log process end
        const horafin = moment().format('YYYY-MM-DD HH:mm:ss');
        const numeje = 999;
        await connection.execute(
            "INSERT INTO sistema_procesos_at (numeje, proceso, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)",
            [numeje, procesng, hora_inicio, horafin]
        );

        // Handle response
        if (excel == 0) {
            // JSON response for normal listing
            let res = 0;
            const AenviosElim = [];

            if (req.body.elim * 1 == 0) {
                // Count deleted shipments
                const countQuery = `
          SELECT COUNT(e.did)
          FROM envios AS e
          LEFT JOIN estados_envios AS et ON (et.elim=0 AND et.did = e.estado)
          LEFT JOIN envios_asignaciones AS ea ON (ea.elim=0 AND ea.superado=0 AND ea.didEnvio = e.did)
          LEFT JOIN envios_historial AS eh2 ON (eh2.didEnvio = e.did ${sqljoin} ${estadoColecta})
          ${joinLI}
          ${joinFO}
          WHERE e.superado=0 AND e.elim=1 ${sqlf} ${mires} ${sqlfecha} ${usuariosIN}
          ORDER BY e.id DESC
        `;

                const [countRows] = await connection.execute(countQuery);
                res = countRows[0]['COUNT(e.did)'];
            } else {
                // Get deleted shipments details
                const elimQuery = `
          SELECT DISTINCT(e.did), DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i'), 
            e.destination_receiver_name, e.destination_shipping_address_line, 
            SA.usuario, DATE_FORMAT(SA.autofecha,'%d/%m/%Y %H:%i'), e.didCliente 
          FROM envios AS e
          LEFT JOIN estados_envios AS et ON (et.elim=0 AND et.did = e.estado)
          LEFT JOIN envios_asignaciones AS ea ON (ea.elim=0 AND ea.superado=0 AND ea.didEnvio = e.did)
          LEFT JOIN envios_historial AS eh2 ON (eh2.didEnvio = e.did ${sqljoin} ${estadoColecta})
          LEFT JOIN sistema_ingresos_activity AS SA ON (SA.modulo = 'eliminra_envio' AND data = e.did) 
          ${joinLI}
          ${joinFO}
          WHERE e.superado=0 AND e.elim=1 ${sqlf} ${mires} ${sqlfecha} ${usuariosIN}
          ORDER BY e.id DESC
        `;

                const [elimRows] = await connection.execute(elimQuery);

                for (const row of elimRows) {
                    const clienteInfo = Aclientes[row.didCliente] || ['', '', '', 0];
                    const nombre_fantasia = clienteInfo[1];
                    const usuarioInfo = Ausuarios[row.usuario] || ['', ''];
                    const quien = `${usuarioInfo[0]} ${usuarioInfo[1]}`;

                    res++;

                    const direccion = row.destination_shipping_address_line || '';
                    const Adirreccion = direccion.split(" ");
                    const largo = Adirreccion.length - 1;
                    const tipo = Adirreccion[largo];

                    let ok = false;
                    if (FILTROS.domicilio == 1 && tipo == "(C)") {
                        ok = true;
                    } else if (FILTROS.domicilio == 2 && tipo == "(R)") {
                        ok = true;
                    } else if (FILTROS.domicilio == 0) {
                        ok = true;
                    }

                    if (!ok) continue;
                    if (AdidUsados.includes(row.did)) continue;

                    AdidUsados.push(row.did);
                    AenviosElim.push({
                        did: row.did,
                        fechagestionar: row.fecha_inicio,
                        nombre: row.destination_receiver_name,
                        nombre_fantasia,
                        direccion,
                        quien,
                        cuando: row.autofecha
                    });
                }
            }

            // Prepare pagination
            const cont = Adatos.length;
            const total_pages = cont > 0 ? Math.ceil(cont / limit) : 0;
            const current_page = page > total_pages ? total_pages : (page == 0 ? 1 : page);

            // Check if controller exists
            let tengo = false;
            try {
                fs.accessSync("controlador.php", fs.constants.F_OK);
                tengo = true;
            } catch (err) {
                tengo = false;
            }

            // Prepare response
            const resultado = {
                pagina: current_page,
                totalPaginas: total_pages,
                cantidadRegistros: totalRegistros,
                estadoLogin: true,
                cantElim: res,
                enviosElim: AenviosElim,
                tengo,
                rows: []
            };

            // Paginate results
            let contadorFila = 0;
            for (let i = 0; i < Adatos.length; i++) {
                const pagFila = Math.ceil((contadorFila + 1) / limit);
                if (current_page == pagFila) {
                    resultado.rows.push(Adatos[i]);
                }
                contadorFila++;
            }

            // Send response
            res.json(resultado);
        } else {
            // Handle Excel export
            // This would require implementing the Excel export functionality
            // Similar to the PHP version's descarga.php
            // For brevity, I'm leaving this as a placeholder
            res.status(500).json({ error: "Excel export not implemented in this example" });
        }

        // Calculate execution time
        const demora = (microtime_float() - DW_etime_start).toFixed(3);

        // Update process log
        if (idllamada != -1) {
            const hora_fin = moment().format('YYYY-MM-DD HH:mm:ss');
            await connection.execute(
                "UPDATE sistema_procesos_at SET error=0, demora=?, hora_fin=? WHERE id=?",
                [demora, hora_fin, idllamada]
            );
        }

        // Close connection
        await connection.end();
    } catch (error) {
        console.error("Error:", error);

        // Update process log with error
        if (idllamada != -1) {
            const hora_fin = moment().format('YYYY-MM-DD HH:mm:ss');
            const connection = await mysql.createConnection(dbConfig);
            await connection.execute(
                "UPDATE sistema_procesos_at SET error=1, demora=0, hora_fin=? WHERE id=?",
                [hora_fin, idllamada]
            );
            await connection.end();
        }

        res.status(500).json({ error: "Internal server error" });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});