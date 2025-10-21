// Generador de payload interno a partir del webhook de Fenicio
// Nota: este armado replica el esquema que usabas con ML para "data"
//       Mantengo nombres de campos para no romper integraciones existentes.
//       Ajusté mapeos según el ejemplo de Fenicio que compartiste.

// ---- helper: fecha actual (yyyy-mm-dd y unix seconds)
async function obtenerFechaActual() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return {
        fecha: `${yyyy}-${mm}-${dd}`,
        unix: Math.floor(now.getTime() / 1000),
    };
}

// ---- helper: utilidades seguras
const toNumber = (v, def = 0) => (v == null || v === '' || isNaN(Number(v)) ? def : Number(v));

// Construye un string de dimensiones como "LxWxH" (si hay datos)
function buildDimensions(item) {
    const L = toNumber(item.length, 0);
    const W = toNumber(item.width, 0);
    const H = toNumber(item.height, 0);
    if (L || W || H) return `${L}x${W}x${H}`; // mismo formato que usabas con ML (solo medidas)
    return "";
}

// Suma segura sobre items * quantity
function sumOn(items, fn) {
    return items.reduce((acc, it) => acc + fn(it), 0);
}

// Calcula peso total (si viene weight por item)
function calcPesoTotal(items) {
    return sumOn(items, (it) => toNumber(it.weight, 0) * toNumber(it.quantity, 0));
}

// Calcula volumen total (LxWxH) * qty, en las unidades provistas
function calcVolumenTotal(items) {
    return sumOn(items, (it) => {
        const L = toNumber(it.length, 0);
        const W = toNumber(it.width, 0);
        const H = toNumber(it.height, 0);
        const q = toNumber(it.quantity, 0);
        if (L && W && H && q) return L * W * H * q;
        return 0;
    });
}

// Suma de valor declarado = price * quantity
function calcValorDeclarado(items) {
    return sumOn(items, (it) => toNumber(it.price, 0) * toNumber(it.quantity, 0));
}

// Suma de bultos desde packages[].quantity (si hay varios packages)
function calcBultos(packages) {
    if (!Array.isArray(packages) || !packages.length) return 0;
    return packages.reduce((acc, p) => acc + toNumber(p.quantity, 0), 0);
}

// Mapeo principal: Fenicio -> data (esquema interno)
async function armadojsonFenicio(income) {
    // Fenicio payload esperado
    const order = income?.order || {};
    const serviceType = income?.serviceType || null; // en tu ejemplo: "001" -> didServicio=1
    const webhook = income?.webhookConfiguration || {}; // <- CORRECTO: viene en income

    // Campos complementarios que ya venían en tu wrapper (si no están, default)
    const didEmpresa = income?.didEmpresa ?? 0;
    const didCliente = income?.didCliente ?? 0;
    const didCuenta = income?.didCuenta ?? 0;

    const delivery = order?.deliveryInformation || {};
    const toAddress = delivery?.toAddress || {};
    const fromAddress = delivery?.fromAddress || {};
    const customer = order?.customer || {};

    // Recipient / contacto
    const receiverName = delivery?.recipientName || [customer?.name, customer?.lastName].filter(Boolean).join(' ').trim();
    const receiverPhone = customer?.phone || '';
    const receiverEmail = customer?.email || '';

    // Items y packages
    const items = Array.isArray(order?.items) ? order.items : [];
    const packages = Array.isArray(order?.packages) ? order.packages : [];

    // Cálculos
    const pesototal = calcPesoTotal(items);
    const volumen = calcVolumenTotal(items);
    const valor_declarado = calcValorDeclarado(items);
    const bultos = calcBultos(packages);

    // preferencia de entrega
    let delivery_preference = 'C'; // C: Comercial, R: Residencial

    // turbo / tags: Fenicio no trae tags
    const turbo = 0;

    // tracking en Fenicio: no provisto en el ejemplo
    const tracking_method = '';
    const tracking_number = '';

    // didMetodoEnvio: si necesitás mapear por serviceType, hacelo acá
    let didMetodoEnvio = 0;

    // didServicio: en tu comentario, serviceType "001" => 1
    const didServicio = serviceType === '001' ? 1 : toNumber(serviceType, 1) || 1;

    // Fecha actual
    const fechactual = await obtenerFechaActual();

    // Armar líneas de items
    const AenviosItems = items.map((it) => ({
        codigo: it.id,
        imagen: '',
        descripcion: it.name,
        ml_id: it.id,
        dimensions: buildDimensions(it),
        cantidad: toNumber(it.quantity, 0),
        variacion: '',
        seller_sku: '',
    }));

    // Address line
    const address_line = [toAddress.street, toAddress.doorNumber].filter(Boolean).join(' ');

    // Observaciones / comentarios
    const destination_comments = toAddress?.additionalInformation || '';

    // Operador + flex
    const operador = 'fenicio';
    const flex = 18;

    // gtoken desde webhook
    const gtoken = webhook?.authorizationKey || '';

    // deadline de entrega
    const deadline = delivery?.deliveryDate?.to || '';

    const data = {
        data: {
            didDeposito: 1,
            idEmpresa: didEmpresa,                // <- antes tenías idEmpresa:275; uso la var que traés

            operador,

            gtoken,
            flex,
            turbo,
            status_order: '',
            fecha_inicio: fechactual.fecha,
            fechaunix: fechactual.unix,
            lote: 'fenicio',

            // Campos ML reutilizados para ID de envío/venta
            ml_shipment_id: String(order?.id || ''),
            ml_vendedor_id: '',
            ml_venta_id: '',
            ml_pack_id: '',

            mode: 'fenicio',
            didMetodoEnvio,
            ml_qr_seguridad: '',
            deadline: deadline,

            didCliente,
            didCuenta,
            didServicio,

            peso: pesototal,
            volumen,
            bultos,
            valor_declarado,
            monto_total_a_cobrar: 0,

            tracking_method,
            tracking_number,

            // ventana de entrega
            fecha_venta: delivery?.deliveryDate?.from || '',

            destination_receiver_name: receiverName,
            destination_receiver_phone: receiverPhone,
            destination_receiver_email: receiverEmail,

            destination_comments,
            delivery_preference,
            quien: 0,

            enviosObservaciones: {
                observacion: "", // si querés: `${destination_comments}${deadline ? ' | Deadline: ' + deadline : ''}`
            },

            enviosDireccionesDestino: {
                calle: toAddress?.street || '',
                numero: toAddress?.doorNumber || '',
                address_line,
                cp: toAddress?.postcode || '',
                localidad: toAddress?.locality || '',
                provincia: toAddress?.region || '',
                pais: toAddress?.country || '',
                latitud: toAddress?.latitude ?? 0,
                longitud: toAddress?.longitude ?? 0,
                quien: 0,
                destination_comments,
                delivery_preference,
            },

            enviosDireccionesRemitente: {
                calle: fromAddress?.street || '',
                numero: fromAddress?.doorNumber || '',
                address_line: [fromAddress?.street, fromAddress?.doorNumber].filter(Boolean).join(' '),
                cp: fromAddress?.postcode || '',
                localidad: fromAddress?.locality || '',
                provincia: fromAddress?.region || '',
                pais: fromAddress?.country || '',
                latitud: fromAddress?.latitude ?? 0,
                longitud: fromAddress?.longitude ?? 0,
                obs: fromAddress?.additionalInformation || '',
            },

            // ⬇⬇⬇ esto se usará para tu tabla envios_wh_fenicio
            enviosFenicio: {
                url: webhook?.url || '',
                authorizationKey: webhook?.authorizationKey || ''
            },

            enviosItems: AenviosItems,
        }
    };

    return data; // seguís devolviendo un único objeto "data"
}


module.exports = { armadojsonFenicio };

