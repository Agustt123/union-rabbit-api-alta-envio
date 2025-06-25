const mysql = require('mysql2/promise');
const moment = require('moment');
const ExcelJS = require('exceljs');

// Database connection configuration
const dbConfig = {
    host: 'your_host',
    user: 'your_user',
    password: 'your_password',
    database: 'your_database'
};

// Helper functions
function microtimeFloat() {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds + nanoseconds / 1e9;
}

function limpiarInsertar(q) {
    q = q.replace(/'/g, '');
    q = q.replace(/"/g, '');
    q = q.trim();
    q = q.replace(/=/g, '');
    q = q.replace(/\\/g, '');
    return q;
}

function calculateCelda(num, uppercase = true) {
    let letters = '';
    while (num > 0) {
        const code = (num % 26 === 0) ? 26 : num % 26;
        letters += String.fromCharCode(code + 64);
        num = (num - code) / 26;
    }
    const result = letters.split('').reverse().join('');
    return uppercase ? result.toUpperCase() : result;
}

// Main function
async function enviosListados(req, res) {
    const { session, post, get } = req;
    const { user, perfil, configuracion, codigoempleado } = session;

    // Initialize variables
    const imodulo = "enviosListados";
    let idllamada = -1;
    let estadomodulo = -1;
    const DW_etime_start = microtimeFloat();
    const hora_inicio = moment().format('YYYY-MM-DD HH:mm:ss');
    const quien = user;

    try {
        // Database connection
        const connection = await mysql.createConnection(dbConfig);

        // Log process start
        const [insertResult] = await connection.execute(
            "INSERT INTO sistema_procesos_at (proceso, error, hora_inicio, quien) VALUES (?, ?, ?, ?)",
            [imodulo, estadomodulo, hora_inicio, quien]
        );
        idllamada = insertResult.insertId;

        // Excel flag
        let excel = 0;
        const horainicio = moment().format('YYYY-MM-DD HH:mm:ss');
        const procesng = "listadoEnvios";

        if (get.excel) {
            excel = 1;
        }

        // Check profile
        if (!perfil) {
            const resultado = { estadoLogin: false };
            return res.json(resultado);
        }

        // Handle CP management
        let manejacp = true;
        const Acomunas = {};
        if (configuracion && configuracion.manejaCP * 1 === 0) {
            manejacp = false;
            const [comunas] = await connection.execute(
                "SELECT id, nombre FROM `comunas_habilitadas` WHERE superado=0"
            );
            comunas.forEach(row => {
                Acomunas[row.id] = row.nombre;
            });
        }

        // Get page and limit
        const page = post.pagina ? parseInt(post.pagina) : 1;
        const limit = post.cantxpagina ? parseInt(post.cantxpagina) : 10;

        // Initialize filters
        const FILTROS = {
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
            logisticaInversa: '',
            fotos: '',
            obs: '',
            deposito: '',
            tipo_fecha: 0,
            fecha_desde: '',
            fecha_hasta: '',
            asignado: '',
            domicilio: 0
        };

        if (excel === 0) {
            if (limit === -1) {
                limit = 9999999999999999999999;
            }
            Object.assign(FILTROS, post.filtros || {});
        } else {
            if (get.appersand) {
                get.nombrecliente = get.nombrecliente.replace("-15", "&");
            }
            if (get.nombrecliente) FILTROS.nombrecliente = get.nombrecliente;
            if (get.zonasdeentrega) FILTROS.zonasdeentrega = get.zonasdeentrega;
            if (get.cadete) FILTROS.cadete = get.cadete;
            if (get.nombre) FILTROS.nombre = get.nombre;
            if (get.cp) FILTROS.cp = get.cp;
            if (get.estado) FILTROS.estado = get.estado;
            if (get.tracking_number) FILTROS.tracking_number = get.tracking_number;
            if (get.idml) FILTROS.idml = get.idml;
            if (get.origen) FILTROS.origen = get.origen;
            if (get.turbo) FILTROS.turbo = get.turbo;
            if (get.logisticaInversa) FILTROS.logisticaInversa = get.logisticaInversa;
            if (get.fotos) FILTROS.fotos = get.fotos;
            if (get.obs) FILTROS.obs = get.obs;
            if (get.deposito) FILTROS.deposito = get.deposito;
            if (get.tipo_fecha) FILTROS.tipo_fecha = get.tipo_fecha;
            if (get.fecha_desde) FILTROS.fecha_desde = get.fecha_desde;
            if (get.fecha_hasta) FILTROS.fecha_hasta = get.fecha_hasta;
            if (get.asignado) FILTROS.asignado = get.asignado;
            if (get.domicilio) FILTROS.domicilio = get.domicilio;
        }

        let sqlf = "";
        let clientesINN = '';
        let selectClis = '';

        // Get clients
        const Aclientes = {};
        if (FILTROS.nombrecliente) {
            selectClis = ` AND nombre_fantasia LIKE '%${limpiarInsertar(FILTROS.nombrecliente)}%' `;
        }

        const [clientes] = await connection.execute(
            `SELECT did, codigo, nombre_fantasia, razon_social, elim AS elimCli FROM clientes WHERE superado=0 ${selectClis}`
        );

        clientes.forEach(row => {
            Aclientes[row.did] = [row.codigo, row.nombre_fantasia, row.razon_social, row.elimCli];
            if (selectClis) {
                clientesINN += clientesINN ? `, ${row.did}` : row.did;
            }
        });

        if (clientesINN) {
            clientesINN = ` AND e.didCliente IN (${clientesINN}) `;
        } else if (FILTROS.nombrecliente) {
            clientesINN = " AND 1=2 ";
        }

        // Get zones
        let zonasIN = '';
        let selectZonas = '';
        if (FILTROS.zonasdeentrega) {
            if (FILTROS.zonasdeentrega * 1 === 0) {
                zonasIN = " 0 ";
            }
            selectZonas = ` AND did IN (${limpiarInsertar(FILTROS.zonasdeentrega)}) `;
        }

        const Azonas = {};
        if (!zonasIN) {
            const [zonas] = await connection.execute(
                `SELECT did, nombre FROM envios_zonas WHERE superado=0 AND elim=0 ${selectZonas}`
            );
            zonas.forEach(row => {
                Azonas[row.did] = row.nombre;
                if (FILTROS.zonasdeentrega) {
                    zonasIN += zonasIN ? `, ${row.did}` : row.did;
                }
            });
        }

        if (zonasIN) {
            zonasIN = ` AND e.didEnvioZona IN (${zonasIN}) `;
        }

        // Get users
        const AusuariosEliminados = [];
        let usuariosIN2 = '';
        let selectUser = '';
        const chferTemp = FILTROS.cadete ? FILTROS.cadete.replace(/ /g, "%") : '';

        if (FILTROS.cadete) {
            selectUser = ` AND ((CONCAT(nombre, ' ', apellido) LIKE '%${limpiarInsertar(chferTemp)}%' ) OR nombre LIKE '%${limpiarInsertar(FILTROS.cadete)}%' OR apellido LIKE '%${limpiarInsertar(FILTROS.cadete)}%')`;
        }

        const Ausuarios = {};
        const [usuarios] = await connection.execute(
            `SELECT did, nombre, apellido, elim FROM sistema_usuarios WHERE superado=0 AND elim=0 ${selectUser}`
        );

        usuarios.forEach(row => {
            Ausuarios[row.did] = [row.nombre, row.apellido];
            if (usuariosIN2) {
                usuariosIN2 += `, ${row.did}`;
            } else {
                usuariosIN2 = row.did;
            }
            if (row.elim === 1) {
                AusuariosEliminados.push(row.did);
            }
        });

        let usuariosIN = "";
        if (usuariosIN2 && FILTROS.cadete) {
            usuariosIN = ` AND ea.operador IN (${usuariosIN2}) `;
        } else if (!usuariosIN && FILTROS.cadete) {
            usuariosIN = "-9999";
        } else {
            usuariosIN = " ";
        }

        // Build SQL filters
        if (excel === 0) {
            let sqlfecha = "";

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
                sqlf += ` AND e.flex IN (${FILTROS.origen})`;
            }
            if (FILTROS.turbo) {
                sqlf += ` AND e.turbo = ${FILTROS.turbo}`;
            }

            // Handle logistics
            let joinLI = '';
            if (FILTROS.logisticaInversa == 0) {
                joinLI = "LEFT JOIN envios_logisticainversa AS LI ON (LI.superado = 0 AND LI.elim = 0 AND LI.didEnvio = e.did)";
                sqlf += " AND LI.didEnvio IS NULL";
            } else if (FILTROS.logisticaInversa == 1) {
                joinLI = "JOIN envios_logisticainversa AS LI ON (LI.superado = 0 AND LI.elim = 0 AND LI.didEnvio = e.did)";
            }

            // Handle photos
            let joinFO = '';
            if (FILTROS.fotos == 0) {
                joinFO = "LEFT JOIN envios_fotos AS FO ON (FO.superado = 0 AND FO.elim = 0 AND FO.didEnvio = e.did)";
                sqlf += " AND FO.didEnvio IS NULL";
            } else if (FILTROS.fotos == 1) {
                joinFO = "JOIN envios_fotos AS FO ON (FO.superado = 0 AND FO.elim = 0 AND FO.didEnvio = e.did)";
            }

            if (FILTROS.obs == 0) {
                sqlf += " AND e.obs = '' ";
            } else if (FILTROS.obs == 1) {
                sqlf += " AND e.obs != '' ";
            }

            // Handle deposit
            let sqldep = "";
            let joinDep = '';
            if (FILTROS.deposito) {
                if (FILTROS.deposito != 0) {
                    joinDep = "LEFT JOIN depositos AS DE ON (DE.superado = 0 AND DE.elim = 0 )";
                    sqldep = `AND e.didDeposito = '${FILTROS.deposito}'`;
                }
            }

            // Date filters
            const Afechascampos = [
                "e.fecha_venta",
                "e.fecha_inicio",
                "eh2.fecha",
                "ea.autofecha",
                "e.fecha_despacho",
                "eh2.fecha",
                "eh2.fecha",
                "",
                "",
                "eh2.fecha",
                "",
                "",
                "",
                "",
                "",
                "eh2.fecha"
            ];

            const tipofecha = FILTROS.tipo_fecha * 1;

            if (FILTROS.fecha_desde) {
                if (FILTROS.fecha_desde) {
                    const t = FILTROS.fecha_desde.split("/");
                    const temp = `${t[2]}-${t[1]}-${t[0]}`;
                    sqlfecha = ` AND ${Afechascampos[tipofecha]} LIKE '${temp}%'`;
                }
                if (FILTROS.fecha_hasta) {
                    const t1 = FILTROS.fecha_desde.split("/");
                    const t1Formatted = `${t1[2]}-${t1[1]}-${t1[0]} 00:00:00`;

                    const t2 = FILTROS.fecha_hasta.split("/");
                    const t2Formatted = `${t2[2]}-${t2[1]}-${t2[0]} 23:59:59`;

                    sqlfecha = ` AND ${Afechascampos[tipofecha]} BETWEEN '${t1Formatted}' AND '${t2Formatted}' `;
                }
            }
        }

        // Profile restrictions
        let mires = "";
        if (perfil != 1) {
            if (perfil == 2) {
                mires = ` AND e.didCliente IN (${codigoempleado}) `;
            } else if (perfil == 3) {
                mires = ` AND ea.operador = '${user}' `;
            }
        }

        // Get shipment states
        const AestadosDB = {};
        const [estados] = await connection.execute(
            "SELECT did, estado FROM estados_envios WHERE elim=0"
        );
        estados.forEach(row => {
            AestadosDB[row.did] = row.estado;
        });

        const Adatos = [];
        let totalRegistros = 0;

        // Define fields based on excel flag
        let campos;
        if (excel == 1) {
            campos = `DISTINCT(e.did), e.didCliente, e.peso, e.ml_vendedor_id, e.ml_shipment_id, DATE_FORMAT(e.fecha_venta,'%d/%m/%Y'), DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i'), e.destination_receiver_name, e.destination_receiver_phone, e.destination_comments, e.destination_shipping_address_line, e.destination_shipping_zip_code, e.destination_city_name, e.destination_state_name, e.destination_latitude, e.destination_longitude, e.lead_time_shipping_method_name, e.ml_venta_id, ea.operador, e.estado_envio, cos.cliente, e.obs, DATE_FORMAT(ea.autofecha,'%d/%m/%Y %H:%i'), DATE_FORMAT(eh2.fecha,'%d/%m/%Y %H:%i'), e.didEnvioZona, e.flex, cos.nameZonaCostoCliente, e.exterior, DATE_FORMAT(eh2.fecha,'%d/%m/%Y %H:%i'), e.destination_receiver_email, cos.chofer, cos.nameZonaCostoChofer, e.ml_qr_seguridad`;
        } else {
            campos = `DISTINCT(e.did), e.didCliente, e.ml_vendedor_id, e.ml_shipment_id, DATE_FORMAT(e.fecha_venta,'%d/%m/%Y %H:%i'), DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i'), e.destination_receiver_name, e.destination_shipping_zip_code, e.estado_envio, e.lead_time_shipping_method_name, DATE_FORMAT(e.estimated_delivery_time_date_72,'%d/%m/%Y'), ml_venta_id, ea.operador, e.didEnvioZona, e.flex, cos.nameZonaCostoCliente, e.exterior, e.destination_shipping_address_line, destination_city_name, turbo, ml_pack_id, e.ml_qr_seguridad`;
        }

        let didce = "";
        let fechasdidicolectas = "";
        const AfechaColecta = {};
        let estadoColecta = "";
        let sqljoin = "AND eh2.elim=0 AND eh2.superado=0 ";

        if (FILTROS.tipo_fecha == 6) {
            estadoColecta = " AND eh2.estado = 1";
            sqljoin = " ";
        } else if (FILTROS.tipo_fecha == 9) {
            estadoColecta = " AND eh2.estado = 8";
            sqljoin = " ";
        } else if (FILTROS.tipo_fecha == 5) {
            estadoColecta = " AND eh2.estado = 0";
            sqljoin = " ";
        } else if (FILTROS.tipo_fecha == 2) {
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
      ${joinLI || ''}
      ${joinFO || ''}
      ${joinDep || ''}
      WHERE e.superado=0 AND e.elim=0 ${sqlf} ${mires} ${sqlfecha} ${clientesINN} ${zonasIN} ${usuariosIN} ${sqldep}
      ORDER BY e.id DESC
    `;

        // Origin names
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

        // Execute main query
        const [envios] = await connection.execute(query);

        if (excel === 0) {
            // Process results for JSON response
            envios.forEach(row => {
                const did = row.did;
                const didCliente = row.didCliente;
                const ml_vendedor_id = row.ml_vendedor_id;
                const tracking = row.ml_shipment_id;
                const fechaventa = row["DATE_FORMAT(e.fecha_venta,'%d/%m/%Y %H:%i')"] || row["DATE_FORMAT(e.fecha_venta,'%d/%m/%Y')"];
                const fechagestionar = row["DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i')"];
                const nombre = row.destination_receiver_name;
                const cp = row.destination_shipping_zip_code;
                const estado_envio = row.estado_envio;
                const lead_time_shipping_method_name = row.lead_time_shipping_method_name;
                const estimated_delivery_time_date_72 = row["DATE_FORMAT(e.estimated_delivery_time_date_72,'%d/%m/%Y')"];
                const ml_venta_id = row.ml_venta_id;
                let didcadete = row.operador;
                const didZona = row.didEnvioZona;
                const flex = row.flex;
                const EnvioZonaCostoName = row.nameZonaCostoCliente;
                const exterior = row.exterior;
                const direccion = row.destination_shipping_address_line;
                const destination_city_name = row.destination_city_name;
                const turbo = row.turbo;
                const ml_pack_id = row.ml_pack_id;
                let QR = row.ml_qr_seguridad;

                const clienteInfo = Aclientes[didCliente] || ['', '', '', 0];
                const codigo = clienteInfo[0];
                const nombre_fantasia = clienteInfo[1];
                const elimCli = clienteInfo[3];

                let zona = 'Sin zona';
                if (Azonas[didZona]) {
                    zona = Azonas[didZona];
                }

                let namecadete = "";
                if (didcadete < 0) {
                    didcadete = 0;
                } else {
                    if (AusuariosEliminados.includes(didcadete)) {
                        namecadete = 'Usuario Eliminado';
                    } else {
                        const usuarioInfo = Ausuarios[didcadete] || ['', ''];
                        namecadete = `${usuarioInfo[0]} ${usuarioInfo[1]}`;
                    }
                }

                // Apply assigned filter
                if (FILTROS.asignado == 0 && didcadete > 0) {
                    return;
                }
                if (FILTROS.asignado == 1 && didcadete < 1) {
                    return;
                }

                // Apply address type filter
                const Adirreccion = direccion ? direccion.split(" ") : [];
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

                if (ok && !AdidUsados.includes(did)) {
                    AdidUsados.push(did);

                    if (!manejacp) {
                        cp = Acomunas[cp] || cp;
                    }
                    if (exterior == 1) {
                        sqldidexternos = sqldidexternos ? `${sqldidexternos},${did}` : did;
                    }

                    const flexname = Anameflex[flex] || '';

                    let zonacosto = "";
                    if (flex == 1) {
                        if (precio_tipo == 2 && !nombrezonacosto) {
                            zonacosto = nombrezonacosto || "Sin Zona";
                        }
                    } else {
                        zonacosto = nombrezonacosto || "Sin Zona";
                    }

                    if (EnvioZonaCostoName) {
                        zonacosto = EnvioZonaCostoName;
                    }

                    if (!zona) {
                        cp = cp ? cp.trim() : '';
                        // Additional zone logic here if needed
                    }

                    if ((!cp || cp === "") && !manejacp && flex == 1) {
                        cp = destination_city_name;
                    }

                    let ml_venta_id_display = ml_venta_id;
                    if (ml_pack_id && flex == 1) {
                        ml_venta_id_display = `${ml_pack_id} (P)`;
                    }

                    if (flex != 1) {
                        const direc = {
                            local: 1,
                            did: did.toString(),
                            cliente: didCliente,
                            empresa: GLOBAL_empresa_id
                        };
                        QR = JSON.stringify(direc);
                    }

                    Adatos.push({
                        did,
                        codigo,
                        flexname: turbo == 1 ? `${flexname} <a style='color:red;'><b>TURBO</b></a>` : flexname,
                        ml_vendedor_id: ml_venta_id_display,
                        zonacosto,
                        tracking,
                        fechaventa,
                        fechagestionar,
                        nombre,
                        cp,
                        estado_envio,
                        didcadete,
                        namecadete,
                        lead_time_shipping_method_name,
                        estimated_delivery_time_date_72,
                        nombre_fantasia,
                        zona,
                        localidad: destination_city_name,
                        qr: QR,
                        elimCli
                    });

                    totalRegistros++;
                }
            });

            // Handle external shipments
            if (sqldidexternos) {
                const [externos] = await connection.execute(
                    `SELECT didLocal, cliente FROM envios_exteriores WHERE superado=0 AND elim=0 AND didLocal IN (${sqldidexternos})`
                );

                const AexternosCLi = {};
                externos.forEach(row => {
                    AexternosCLi[row.didLocal] = row.cliente;
                });

                Adatos.forEach((datalin, i) => {
                    if (AexternosCLi[datalin.did] && GLOBAL_empresa_id != 114) {
                        Adatos[i].nombre_fantasia += ` ${AexternosCLi[datalin.did]}`;
                    }
                });
            }

            // Handle deleted shipments if needed
            let res = 0;
            const AenviosElim = [];
            if (post.elim * 1 == 0) {
                const [countResult] = await connection.execute(`
          SELECT COUNT(e.did)
          FROM envios AS e
          LEFT JOIN estados_envios AS et ON (et.elim=0 AND et.did = e.estado)
          LEFT JOIN envios_asignaciones AS ea ON (ea.elim=0 AND ea.superado=0 AND ea.didEnvio = e.did)
          LEFT JOIN envios_historial AS eh2 ON (eh2.didEnvio = e.did ${sqljoin} ${estadoColecta})
          ${joinLI || ''}
          ${joinFO || ''}
          WHERE e.superado=0 AND e.elim=1 ${sqlf} ${mires} ${sqlfecha} ${clientesINN} ${usuariosIN}
          ORDER BY e.id DESC
        `);
                res = countResult[0]['COUNT(e.did)'];
            } else {
                const [eliminados] = await connection.execute(`
          SELECT DISTINCT(e.did), DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i') AS fechagestionar, 
          e.destination_receiver_name AS nombre, e.destination_shipping_address_line AS direccion, 
          SA.usuario AS didUsuario, DATE_FORMAT(SA.autofecha,'%d/%m/%Y %H:%i') AS cuando, e.didCliente
          FROM envios AS e
          LEFT JOIN estados_envios AS et ON (et.elim=0 AND et.did = e.estado)
          LEFT JOIN envios_asignaciones AS ea ON (ea.elim=0 AND ea.superado=0 AND ea.didEnvio = e.did)
          LEFT JOIN envios_historial AS eh2 ON (eh2.didEnvio = e.did ${sqljoin} ${estadoColecta})
          LEFT JOIN sistema_ingresos_activity AS SA ON (SA.modulo = 'eliminra_envio' AND data = e.did)
          ${joinLI || ''}
          ${joinFO || ''}
          WHERE e.superado=0 AND e.elim=1 ${sqlf} ${mires} ${sqlfecha} ${usuariosIN}
          ORDER BY e.id DESC
        `);

                eliminados.forEach(row => {
                    const nombre_fantasia = Aclientes[row.didCliente] ? Aclientes[row.didCliente][1] : '';
                    const quien = Ausuarios[row.didUsuario] ? `${Ausuarios[row.didUsuario][0]} ${Ausuarios[row.didUsuario][1]}` : '';

                    const Adirreccion = row.direccion ? row.direccion.split(" ") : [];
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

                    if (ok && !AdidUsados.includes(row.did)) {
                        AdidUsados.push(row.did);
                        AenviosElim.push({
                            did: row.did,
                            fechagestionar: row.fechagestionar,
                            nombre: row.nombre,
                            nombre_fantasia,
                            direccion: row.direccion,
                            quien,
                            cuando: row.cuando
                        });
                        res++;
                    }
                });
            }

            // Prepare JSON response
            const cont = Adatos.length;
            const resultado = {
                pagina: page,
                totalPaginas: Math.ceil(cont / limit),
                cantidadRegistros: totalRegistros,
                estadoLogin: true,
                cantElim: res,
                enviosElim: AenviosElim,
                tengo: true, // Assuming controlador.php exists
                rows: []
            };

            let i = 0;
            let contadorFila = 0;
            Adatos.forEach((Avalor, indice) => {
                const pagFila = Math.ceil((contadorFila + 1) / limit);
                if (page == pagFila) {
                    resultado.rows[i] = Avalor;
                    i++;
                }
                contadorFila++;
            });

            // Log process end
            const horafin = moment().format('YYYY-MM-DD HH:mm:ss');
            const numeje = 999;
            await connection.execute(
                "INSERT INTO sistema_procesos_at (numeje, proceso, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)",
                [numeje, procesng, horainicio, horafin]
            );

            const demora = (microtimeFloat() - DW_etime_start).toFixed(3);
            if (idllamada != -1) {
                await connection.execute(
                    "UPDATE sistema_procesos_at SET error=0, demora=?, hora_fin=? WHERE id=?",
                    [demora, horafin, idllamada]
                );
            }

            await connection.end();
            return res.json(resultado);
        } else {
            // Handle Excel export
            const Adatosexcel = [];
            const Aemail = {};
            const AcostoEnvio = {};
            const AcamposEspeciales = {};
            const AestadosQUienUltimo = {};

            envios.forEach(row => {
                const did = row.did;
                const didCliente = row.didCliente;
                const peso = row.peso;
                const mlvendedorid = row.ml_vendedor_id;
                const mlshipmnetid = row.ml_shipment_id;
                const fechaventa = row["DATE_FORMAT(e.fecha_venta,'%d/%m/%Y')"];
                const fechagestionar = row["DATE_FORMAT(e.fecha_inicio,'%d/%m/%Y %H:%i')"];
                const nombredestinatario = row.destination_receiver_name;
                const telefonodestinatario = row.destination_receiver_phone;
                const comentariodestino = row.destination_comments;
                const direccion = row.destination_shipping_address_line;
                let cp = row.destination_shipping_zip_code;
                const localidad = row.destination_city_name;
                const provincia = row.destination_state_name;
                const latitud = row.destination_latitude;
                const longitud = row.destination_longitude;
                const metodoenvio = row.lead_time_shipping_method_name;
                const mlventaid = row.ml_venta_id;
                let didcadete = row.operador;
                const estado_envio = row.estado_envio;
                const costoenvio = row.cliente;
                const obs = row.obs;
                const fechaasignacion = row["DATE_FORMAT(ea.autofecha,'%d/%m/%Y %H:%i')"];
                const fechaestadoenvio = row["DATE_FORMAT(eh2.fecha,'%d/%m/%Y %H:%i')"];
                const didZona = row.didEnvioZona;
                const flex = row.flex;
                const EnvioZonaCostoName = row.nameZonaCostoCliente;
                const exterior = row.exterior;
                const fechaestadoactual = row["DATE_FORMAT(eh2.fecha,'%d/%m/%Y %H:%i')"];
                const email = row.destination_receiver_email;
                const costoChofer = row.chofer;
                const nombreZonaCostoChofer = row.nameZonaCostoChofer;
                let QR = row.ml_qr_seguridad;

                const clienteInfo = Aclientes[didCliente] || ['', '', '', 0];
                const clicodigo = clienteInfo[0];
                const nombre_fantasia = clienteInfo[1];
                const razon_social = clienteInfo[2];

                let zona = Azonas[didZona] || '';

                let namecadete = "";
                if (didcadete < 0) {
                    didcadete = 0;
                } else {
                    if (AusuariosEliminados.includes(didcadete)) {
                        namecadete = 'Usuario Eliminado';
                    } else {
                        const usuarioInfo = Ausuarios[didcadete] || ['', ''];
                        namecadete = `${usuarioInfo[0]} ${usuarioInfo[1]}`;
                    }
                }

                // Apply assigned filter
                if (FILTROS.asignado == 0 && didcadete > 0) {
                    return;
                }
                if (FILTROS.asignado == 1 && didcadete < 1) {
                    return;
                }

                // Apply address type filter
                const Adirreccion = direccion ? direccion.split(" ") : [];
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

                if (ok && !AdidUsados.includes(did)) {
                    AdidUsados.push(did);
                    didce = didce ? `${didce},${did}` : did;

                    if (exterior == 1) {
                        sqldidexternos = sqldidexternos ? `${sqldidexternos},${did}` : did;
                    }

                    const flexname = Anameflex[flex] || '';

                    let zonacosto = "";
                    if (flex == 1) {
                        zonacosto = "DIRECTO ML";
                        if (precio_tipo == 1) {
                            zonacosto = "ML C/D";
                        } else if (precio_tipo == 2) {
                            zonacosto = nombrezonacosto || "Sin Zona";
                        }
                    } else {
                        zonacosto = nombrezonacosto || "Sin Zona";
                    }

                    if (EnvioZonaCostoName) {
                        zonacosto = EnvioZonaCostoName;
                    }

                    if (fechasdidicolectas) {
                        fechasdidicolectas += `,${did}`;
                    } else {
                        fechasdidicolectas = did;
                    }

                    const urltracking = `${GLOBAL_url}/tracking.php?token=${did}d54df4s8a${didCliente}`;

                    Adatosexcel.push({
                        did,
                        codigoCliente: clicodigo,
                        peso,
                        mlvendedorid,
                        mlshipmnetid,
                        fechaventa,
                        fechagestionar,
                        nombredestinatario,
                        telefonodestinatario,
                        email,
                        comentariodestino,
                        direccion,
                        cp,
                        localidad,
                        provincia,
                        latitud,
                        longitud,
                        metodoenvio,
                        mlventaid,
                        didcadete,
                        namecadete,
                        estado_envio,
                        estado_envio_name: AestadosDB[estado_envio] || '',
                        razon_social,
                        costoenvio,
                        nombre_fantasia,
                        obs,
                        fechaasignacion,
                        fechaestadoenvio: fechaestadoactual,
                        zonaname: zona,
                        zonacosto,
                        flexname,
                        urltracking,
                        quienestadoenvio: "",
                        costoChofer,
                        nombreZonaCostoChofer,
                        qr: QR
                    });

                    totalRegistros++;
                }
            });

            // Get additional data for Excel
            if (fechasdidicolectas) {
                const [colectas] = await connection.execute(
                    `SELECT didEnvio, DATE_FORMAT(autofecha,'%d/%m/%Y %H:%i') AS fecha 
           FROM envios_historial 
           WHERE elim=0 AND didEnvio IN (${fechasdidicolectas}) AND estado=0`
                );
                colectas.forEach(row => {
                    AfechaColecta[row.didEnvio] = row.fecha;
                });

                const [ultimosEstados] = await connection.execute(
                    `SELECT didEnvio, DATE_FORMAT(fecha,'%d/%m/%Y %H:%i') AS fecha 
           FROM envios_historial 
           WHERE elim=0 AND didEnvio IN (${fechasdidicolectas}) AND superado=0`
                );
                ultimosEstados.forEach(row => {
                    Aultimoestadofecha[row.didEnvio] = row.fecha;
                });

                const [quienEstados] = await connection.execute(
                    `SELECT eh.didEnvio, CONCAT(su.nombre, ' ', su.apellido) AS quien
           FROM envios_historial AS eh
           LEFT JOIN sistema_usuarios AS su ON (su.elim=0 AND su.superado=0 AND su.did = eh.quien)
           WHERE eh.superado=0 AND didEnvio IN (${fechasdidicolectas})`
                );
                quienEstados.forEach(row => {
                    AestadosQUienUltimo[row.didEnvio] = row.quien;
                });
            }

            // Handle external shipments for Excel
            if (sqldidexternos) {
                const [externos] = await connection.execute(
                    `SELECT didLocal, cliente FROM envios_exteriores WHERE superado=0 AND elim=0 AND didLocal IN (${sqldidexternos})`
                );
                const AexternosCLi = {};
                externos.forEach(row => {
                    AexternosCLi[row.didLocal] = row.cliente;
                });

                Adatosexcel.forEach(item => {
                    if (AexternosCLi[item.did] && GLOBAL_empresa_id != 114) {
                        item.nombre_fantasia += ` ${AexternosCLi[item.did]}`;
                    }
                });
            }

            // Get special fields data
            if (didce) {
                const [camposEspeciales] = await connection.execute(
                    `SELECT didEnvio, didCampo, valor FROM envios_campos_extras 
           WHERE superado=0 AND elim=0 AND didEnvio IN (${didce})`
                );
                camposEspeciales.forEach(row => {
                    if (!AcamposEspeciales[row.didEnvio]) {
                        AcamposEspeciales[row.didEnvio] = {};
                    }
                    AcamposEspeciales[row.didEnvio][`DP_${row.didCampo}`] = row.valor;
                });

                const [cobranzas] = await connection.execute(
                    `SELECT didEnvio, didCampoCobranza, valor FROM envios_cobranzas 
           WHERE superado=0 AND elim=0 AND didEnvio IN (${didce})`
                );
                cobranzas.forEach(row => {
                    if (!AcamposEspeciales[row.didEnvio]) {
                        AcamposEspeciales[row.didEnvio] = {};
                    }
                    AcamposEspeciales[row.didEnvio][`DC_${row.didCampoCobranza}`] = row.valor;
                });

                const [logisticaInversa] = await connection.execute(
                    `SELECT didEnvio, didCampoLogistica, valor FROM envios_logisticainversa 
           WHERE superado=0 AND elim=0 AND didEnvio IN (${didce})`
                );
                logisticaInversa.forEach(row => {
                    if (!AcamposEspeciales[row.didEnvio]) {
                        AcamposEspeciales[row.didEnvio] = {};
                    }
                    AcamposEspeciales[row.didEnvio][`DL_${row.didCampoLogistica}`] = row.valor;
                });
            }

            // Get special fields definitions
            const [datosPaqueteria] = await connection.execute(
                "SELECT did, nombre, datos FROM sistema_datosPaqueteria WHERE superado=0 AND elim=0 ORDER BY orden ASC"
            );
            const [datosCobranzas] = await connection.execute(
                "SELECT did, nombre FROM sistema_datosPaqueteria_cobranzas WHERE superado=0 AND elim=0 ORDER BY orden ASC"
            );
            const [datosLogistica] = await connection.execute(
                "SELECT did, nombre FROM sistema_datosPaqueteria_logisticainversa WHERE superado=0 AND elim=0 ORDER BY orden ASC"
            );

            // Log process end
            const horafin = moment().format('YYYY-MM-DD HH:mm:ss');
            const numeje = 999;
            await connection.execute(
                "INSERT INTO sistema_procesos_at (numeje, proceso, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)",
                [numeje, procesng, horainicio, horafin]
            );

            const demora = (microtimeFloat() - DW_etime_start).toFixed(3);
            if (idllamada != -1) {
                await connection.execute(
                    "UPDATE sistema_procesos_at SET error=0, demora=?, hora_fin=? WHERE id=?",
                    [demora, horafin, idllamada]
                );
            }

            await connection.end();

            // Create Excel file
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Simple');

            // Set column headers
            const Acolumnas = [
                { Nombre: "ID (Interno)", tipo: "string", key: "did", e: 0 },
                { Nombre: "Número Tracking", tipo: "string", key: "mlshipmnetid", e: 0 },
                { Nombre: "ID venta ML", tipo: "string", key: "mlventaid", e: 0 },
                { Nombre: "Usuario ML ID", tipo: "string", key: "mlvendedorid", e: 0 },
                { Nombre: "Fecha Venta", tipo: "string", key: "fechaventa", e: 0 },
                { Nombre: "Fecha Colecta", tipo: "string", key: "fechacolecta", e: 0 },
                { Nombre: `Fecha ${GLOBAL_EMPRESA}`, tipo: "string", key: "fechagestionar", e: 0 },
                { Nombre: "Método de envío", tipo: "string", key: "metodoenvio", e: 0 },
                { Nombre: "Cod.Cliente", tipo: "string", key: "codigoCliente", e: 0 },
                { Nombre: "Razon Social", tipo: "string", key: "razon_social", e: 0 },
                { Nombre: "Nombre Fantasia", tipo: "string", key: "nombre_fantasia", e: 0 },
                { Nombre: "Nombre Destinatario", tipo: "string", key: "nombredestinatario", e: 0 },
                { Nombre: "Tel. Destinatario", tipo: "string", key: "telefonodestinatario", e: 0 },
                { Nombre: "Email Destinatario", tipo: "string", key: "email", e: 0 }
            ];

            if (GLOBAL_empresa_id == 61) {
                Acolumnas.push({ Nombre: "Peso", tipo: "string", key: "peso", e: 0 });
            }

            Acolumnas.push(
                { Nombre: "Comentario Destino", tipo: "string", key: "comentariodestino", e: 0 },
                { Nombre: "Dirección", tipo: "string", key: "direccion", e: 0 },
                { Nombre: "CP", tipo: "string", key: "cp", e: 0 },
                { Nombre: "Localidad", tipo: "string", key: "localidad", e: 0 },
                { Nombre: "Provincia", tipo: "string", key: "provincia", e: 0 },
                { Nombre: "Latitud", tipo: "string", key: "latitud", e: 0 },
                { Nombre: "Longitud", tipo: "string", key: "longitud", e: 0 },
                { Nombre: "Estado", tipo: "string", key: "estado_envio_name", e: 0 },
                { Nombre: "Fecha estado", tipo: "string", key: "fechaestadoenvio", e: 0 },
                { Nombre: "Quien estado", tipo: "string", key: "quienestadoenvio", e: 0 }
            );

            if (GLOBAL_empresa_id == 125) {
                Acolumnas.push({ Nombre: "Valor declarado", tipo: "string", key: "costo_declarado", e: 0 });
            }

            if (perfil == 1 || perfil == 2) {
                Acolumnas.push({ Nombre: "Costo Envio", tipo: "money", key: "costoenvio", e: 0, estotal: true });
                if (perfil == 1) {
                    Acolumnas.push(
                        { Nombre: "Cadete", tipo: "string", key: "namecadete", e: 0 },
                        { Nombre: "Fecha de asignación", tipo: "string", key: "fechaasignacion", e: 0 }
                    );
                }
            }

            Acolumnas.push(
                { Nombre: "Zonas", tipo: "string", key: "zonaname", e: 0 },
                { Nombre: "ZonasCostos", tipo: "string", key: "zonacosto", e: 0 }
            );

            if (GLOBAL_empresa_id == 61) {
                Acolumnas.push({ Nombre: "Costo declarado", tipo: "string", key: "costo_declarado", e: 0 });
            }

            if (GLOBAL_empresa_id == 132 && perfil != 2) {
                Acolumnas.push(
                    { Nombre: "Costo Chofer", tipo: "string", key: "costoChofer", e: 0 },
                    { Nombre: "Zona Costo Chofer", tipo: "string", key: "nombreZonaCostoChofer", e: 0 }
                );
            }

            Acolumnas.push(
                { Nombre: "Origen", tipo: "string", key: "flexname", e: 0 },
                { Nombre: "Observaciones", tipo: "string", key: "obs", e: 0 },
                { Nombre: "URl Tracking", tipo: "string", key: "urltracking", e: 0 }
            );

            if (GLOBAL_empresa_id == 22) {
                Acolumnas.push({ Nombre: "Con doble visita", tipo: "string", key: "doblevisitaTornus", e: 0 });
            }

            if (GLOBAL_empresa_id == 227) {
                Acolumnas.push({ Nombre: "Bultos", tipo: "string", key: "bultos", e: 0 });
            }

            // Add special fields columns
            datosPaqueteria.forEach(row => {
                Acolumnas.push({
                    Nombre: row.nombre,
                    tipo: "string",
                    key: `DP_${row.did}`,
                    e: 1
                });
            });

            datosCobranzas.forEach(row => {
                Acolumnas.push({
                    Nombre: row.nombre,
                    tipo: "string",
                    key: `DC_${row.did}`,
                    e: 1
                });
            });

            datosLogistica.forEach(row => {
                Acolumnas.push({
                    Nombre: row.nombre,
                    tipo: "string",
                    key: `DL_${row.did}`,
                    e: 1
                });
            });

            // Add headers to worksheet
            let i = 1;
            worksheet.mergeCells(`A1:B1`);
            worksheet.getCell(`A${i}`).value = "Filtros Aplicados";
            i++;

            if (FILTROS.nombre) {
                worksheet.getCell(`A${i}`).value = `Nombre Destinatario: ${FILTROS.nombre}`;
                i++;
            }

            if (FILTROS.cp) {
                worksheet.getCell(`A${i}`).value = `CP Destinatario: ${FILTROS.cp}`;
                i++;
            }

            if (FILTROS.tipo_fecha == 0) {
                let tti = "Fecha de venta: ";
                if (FILTROS.fecha_desde && FILTROS.fecha_hasta) {
                    tti += `Desde el ${FILTROS.fecha_desde} hasta el ${FILTROS.fecha_hasta}`;
                } else if (FILTROS.fecha_desde) {
                    tti += FILTROS.fecha_desde;
                }
                worksheet.getCell(`A${i}`).value = tti;
                i++;
            } else if (FILTROS.tipo_fecha == 1) {
                let tti = `Fecha ${GLOBAL_EMPRESA}: `;
                if (FILTROS.fecha_desde && FILTROS.fecha_hasta) {
                    tti += `Desde el ${FILTROS.fecha_desde} hasta el ${FILTROS.fecha_hasta}`;
                } else if (FILTROS.fecha_desde) {
                    tti += FILTROS.fecha_desde;
                }
                worksheet.getCell(`A${i}`).value = tti;
                i++;
            } else if (FILTROS.tipo_fecha == 2) {
                let tti = "Fecha entregado: ";
                if (FILTROS.fecha_desde && FILTROS.fecha_hasta) {
                    tti += `Desde el ${FILTROS.fecha_desde} hasta el ${FILTROS.fecha_hasta}`;
                } else if (FILTROS.fecha_desde) {
                    tti += FILTROS.fecha_desde;
                }
                worksheet.getCell(`A${i}`).value = tti;
                i++;
            } else if (FILTROS.tipo_fecha == 5) {
                let tti = "Fecha colecta: ";
                if (FILTROS.fecha_desde && FILTROS.fecha_hasta) {
                    tti += `Desde el ${FILTROS.fecha_desde} hasta el ${FILTROS.fecha_hasta}`;
                } else if (FILTROS.fecha_desde) {
                    tti += FILTROS.fecha_desde;
                }
                worksheet.getCell(`A${i}`).value = tti;
                i++;
            }

            const Afiltros = {
                "-1": "Todos",
                "0,1,2,3": "Pendientes",
                "0,1,2,3,7": "Pendientes",
                "5,6": "Cerrado",
                "0": "Retirado",
                "1": "En planta de procesamiento",
                "2": "En camino al destinatario",
                "3": "Devolviendo a planta de procesamiento",
                "5": "Entregado",
                "6": "Nadie",
                "7": "A retirar",
                "8": "Cancelados"
            };

            worksheet.getCell(`A${i}`).value = `Estado: ${Afiltros[FILTROS.estado] || ''}`;
            i++;
            i++;

            // Add column headers
            Acolumnas.forEach((columna, indice) => {
                const letra = calculateCelda(indice + 1);
                worksheet.getCell(`${letra}${i}`).value = columna.Nombre;
            });

            i++;

            // Add data rows
            let total = 0;
            Adatosexcel.forEach(datoexcel => {
                const didenvio = datoexcel.did;
                total += parseFloat(datoexcel.costoenvio) || 0;
                const codcli = datoexcel.codigoCliente;

                Acolumnas.forEach((columna, indiceLetra) => {
                    if (columna.e == 1) return;

                    let valor;
                    if (columna.key == "fechacolecta") {
                        valor = AfechaColecta[didenvio] || "";
                    } else if (columna.key == "quienestadoenvio") {
                        valor = AestadosQUienUltimo[didenvio] || "";
                    } else if (columna.key == "fechaestadoenvio") {
                        valor = Aultimoestadofecha[didenvio] || "";
                    } else {
                        valor = datoexcel[columna.key] || "";
                    }

                    if (columna.key == "mlvendedorid" && (valor == 0 || valor == '')) {
                        valor = codcli;
                    }

                    // Special handling for different companies
                    if (GLOBAL_empresa_id == 22 && columna.key == "doblevisitaTornus") {
                        valor = Acondobleentrega[didenvio] ? "SI" : "";
                    }

                    if (GLOBAL_empresa_id == 61) {
                        if (columna.key == "peso") {
                            valor = datoexcel[columna.key] || "";
                        }
                        if (columna.key == "costo_declarado") {
                            valor = AcostoEnvio[didenvio] || "";
                        }
                    }

                    if (GLOBAL_empresa_id == 125 && columna.key == "costo_declarado") {
                        valor = AcostoEnvio[didenvio] || "";
                    }

                    if (GLOBAL_empresa_id == 227 && columna.key == "bultos") {
                        valor = AcostoEnvio[didenvio] || "";
                    }

                    const letra = calculateCelda(indiceLetra + 1);
                    const cell = worksheet.getCell(`${letra}${i}`);

                    if (columna.tipo == "money") {
                        cell.value = parseFloat(valor) || 0;
                        cell.numFmt = '#,##0.00';
                    } else if (columna.tipo == "string") {
                        cell.value = valor;
                        cell.numFmt = '@';
                    } else {
                        cell.value = valor;
                    }
                });

                // Add special fields data
                Acolumnas.forEach((columna, indiceLetra) => {
                    if (columna.e == 0) return;

                    const letra = calculateCelda(indiceLetra + 1);
                    const valor = AcamposEspeciales[didenvio] ? AcamposEspeciales[didenvio][columna.key] || "" : "";
                    worksheet.getCell(`${letra}${i}`).value = valor;
                });

                i++;
            });

            // Add total row
            Acolumnas.forEach((columna, indiceLetra) => {
                if (!columna.estotal) return;

                const letra = calculateCelda(indiceLetra + 1);
                const cell = worksheet.getCell(`${letra}${i}`);
                cell.value = total;
                cell.numFmt = '#,##0.00';
            });

            // Set column widths
            worksheet.getColumn('B').width = 20;
            worksheet.getColumn('C').width = 20;
            worksheet.getColumn('D').width = 20;

            // Set response headers
            const filename = `listado_envios_${moment().format('YYYYMMDDHHmmss')}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            // Write Excel file to response
            await workbook.xlsx.write(res);
            return res.end();
        }
    } catch (error) {
        console.error('Error:', error);
        const demora = (microtimeFloat() - DW_etime_start).toFixed(3);
        if (idllamada != -1) {
            try {
                const connection = await mysql.createConnection(dbConfig);
                await connection.execute(
                    "UPDATE sistema_procesos_at SET error=1, demora=?, hora_fin=? WHERE id=?",
                    [demora, moment().format('YYYY-MM-DD HH:mm:ss'), idllamada]
                );
                await connection.end();
            } catch (dbError) {
                console.error('DB Error:', dbError);
            }
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = enviosListados;