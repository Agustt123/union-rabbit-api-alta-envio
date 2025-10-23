const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // <- agregado

// ⚠️ Asegurate de tener el archivo del armador en el mismo directorio
const { armadojsonFenicio } = require('./fenicio.js');


const app = express();
const PORT = process.env.PORT || 13000;
const SAVE_DIR = 'orders';

// adónde posteamos el payload armado
const TARGET_URL = process.env.TARGET_URL || 'https://altaenvios.lightdata.com.ar/api/altaenvio'; // <- agregado

// Mapa de claves -> IDs (empresa/cuenta/cliente)
const Aclaves = Object.create(null);
Aclaves['c5e84237cf3a3ff415289ecf637ae2be31eb04c206f4cb8ff32305fdc5d9c121'] = {
    didCliente: 5,
    didCuenta: 2,
    didEmpresa: 275,
};

// Utils ----------------------------------------------------------------------
fs.mkdirSync(SAVE_DIR, { recursive: true });
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf.toString('utf8');
        },
    })
);

function ts() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getAuthToken(req) {
    const raw = req.get('authorization') || req.get('Authorization') || '';
    if (!raw) return '';
    const parts = raw.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1].trim();
    return raw.trim();
}

// Endpoint -------------------------------------------------------------------
app.post('/fenicio/createShipping', async (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Parseo seguro
        let body = req.body;
        if (!body || typeof body !== 'object') {
            try {
                body = JSON.parse(raw);
            } catch (_) {
                return res.status(400).json({ status: false, error: 'Invalid JSON' });
            }
        }

        // Auth -> IDs
        const token = getAuthToken(req);
        const clave = Aclaves[token];
        if (!clave) {
            return res.status(403).json({ status: false, error: 'Unauthorized (bad token)' });
        }

        // Guardado de archivos
        const orderId = body?.order?.id ?? 'unknown';
        const base = `${ts()}_order-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify({ ...body, _auth: token.slice(0, 8) + '…' }, null, 2), 'utf8');

        // Enriquecer income y llamar al armador
        const income = {
            ...body,
            didEmpresa: clave.didEmpresa,
            didCliente: clave.didCliente,
            didCuenta: clave.didCuenta,
            webhookConfiguration: body.webhookConfiguration || body.webhook || body.Webhook || {},
        };

        const armado = await armadojsonFenicio(income);

        console.log('[payload]', JSON.stringify(armado.data, null, 2));
        let r;
        // === POST simple con axios ===
        try {
            console.log(JSON.stringify(armado));

            r = await axios.post(TARGET_URL, armado, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            });
            console.log(`[POST -> ${TARGET_URL}] status=${r.status}`);
        } catch (postErr) {
            const status = postErr.response?.status || 'n/a';
            console.error(`[POST -> ${TARGET_URL}] ERROR status=${status} msg=${postErr.message}`);
        }

        const urlImp = `http://files.lightdata.app/print/etiqueta?token=${r.data.token}&didEmpresa=${clave.didEmpresa}&didEnvio=${r.data.did}`;


        // Respuesta a Fenicio
        const resp = {
            trackingCode: `${r.data.did}d54df4s8a${clave.didCliente}`,
            labelUrl: urlImp,
        };

        if (process.env.DEBUG_PAYLOAD === '1') {
            resp._payload = armado.data;
        }

        return res.json(resp);
    } catch (err) {
        console.error('Error /fenicio/createShipping:', (err && (err.stack || err.message)) || err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/getDeliveryTimeSlots', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/getDeliveryTimeSlots | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}_getDeliveryTimeSlots-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "deliveryTimeSlots": [
                { "day": 1, "from": "2025-01-01T09:00:00-03:00", "to": "2025-01-01T12:00:00-03:00" }
            ]
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/getShippingCost', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/getShippingCost | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}getShippingCost-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "shippingCost": 123.45
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/getShippingEvents', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/getShippingEvents | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}getShippingEvents-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "shippingEvents": [
                {
                    "statusCode": "CREATED",
                    "generatedAt": "2025-08-19T19:45:00Z",     // DateTime ISO8601
                    "description": "Etiqueta generada",
                    "details": "Opcional con más info o null"
                }

            ]
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/getShippingLocation', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/getShippingLocation | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}getShippingLocation-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "deliveryTimeSlots": [
                { "day": 1, "from": "2025-01-01T09:00:00-03:00", "to": "2025-01-01T12:00:00-03:00" }
            ]
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/getTimeSlots', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/getTimeSlots | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}_getTimeSlots-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "timeSlots": [
                { "day": 1, "from": "2000-01-01T09:00:00-03:00", "to": "2000-01-01T12:00:00-03:00" }
            ]
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/validateAddress', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/validateAddress | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}_validateAddress-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "isValid": true
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/validateAddress', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/validateAddress | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}_validateAddress-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "IsValid": true
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});

app.post('/fenicio/webhooks', (req, res) => {
    try {
        const raw = req.rawBody || '';
        if (!raw) return res.status(400).json({ status: false, error: 'Empty body' });

        // Intento de parseo (por si necesitás usarlo)
        let data = req.body;
        if (!data || typeof data !== 'object') {
            try { data = JSON.parse(raw); } catch (_e) { }
        }

        // Logueo simple (headers útiles)
        const auth = req.get('authorization') || '';
        console.log(`[${new Date().toISOString()}] POST /fenicio/webhooks | Authorization: ${auth}`);

        // Nombres de archivo
        const orderId = data?.order?.id ?? 'unknown';
        const base = `${ts()}_webhooks-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        // Guardar crudo y pretty
        fs.writeFileSync(rawPath, raw, 'utf8');
        fs.writeFileSync(prettyPath, JSON.stringify(data, null, 2), 'utf8');

        return res.json({
            "response": true
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ status: false, error: 'Internal error' });
    }
});
//webhooks

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
