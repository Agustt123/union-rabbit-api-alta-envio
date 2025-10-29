const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const axios = require('axios');

const { armadojsonFenicio } = require('./fenicio.js');
const Aclaves = require('./aclaves-json'); // <- reemplazo JSON

const app = express();
const PORT = process.env.PORT || 13000;
const SAVE_DIR = 'orders';
const TARGET_URL = process.env.TARGET_URL || 'https://altaenvios.lightdata.com.ar/api/altaenvio';

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


app.post('/fenicio/tokens', async (req, res) => {
    try {
        const entry = req.body || {};
        const out = await Aclaves.add({
            token: String(entry.token || '').trim(),
            didCliente: Number(entry.didCliente),
            didCuenta: Number(entry.didCuenta),
            didEmpresa: Number(entry.didEmpresa),
        });
        return res.status(201).json({ ok: true, data: out });
    } catch (err) {
        const status = err.status || (err.code === 'E_DUP' ? 409 : 500);
        return res.status(status).json({ ok: false, error: err.message || 'Error' });
    }
});


app.delete('/fenicio/tokens/:token', async (req, res) => {
    try {
        const removed = await Aclaves.remove(req.params.token);
        if (!removed) return res.status(404).json({ ok: false, error: 'Token no encontrado' });
        return res.json({ ok: true, removed: req.params.token });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message || 'Error' });
    }
});


app.get('/fenicio/tokens', async (_req, res) => {
    const all = await Aclaves.getAll();
    res.json({ count: all.length, data: all.map(e => ({ ...e, token: e.token.slice(0, 8) + '…' })) });
});


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

        // Auth -> IDs desde el JSON
        const token = getAuthToken(req);
        const clave = await Aclaves.getByToken(token);
        if (!clave) {
            return res.status(403).json({ status: false, error: 'Unauthorized (bad token)' });
        }

        // Guardado de archivos
        const orderId = body?.order?.id ?? 'unknown';
        const base = `${ts()}_order-${orderId}`;
        const rawPath = path.join(SAVE_DIR, `${base}.raw.json`);
        const prettyPath = path.join(SAVE_DIR, `${base}.json`);

        await fsp.writeFile(rawPath, raw, 'utf8');
        await fsp.writeFile(prettyPath, JSON.stringify({ ...body, _auth: token.slice(0, 8) + '…' }, null, 2), 'utf8');

        // Enriquecer y armar payload
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
            // si el POST falló, devolvemos error acorde
            return res.status(502).json({ status: false, error: 'Error al postear a TARGET_URL', details: String(status) });
        }

        const urlImp = `https://files.lightdata.app/print/etiqueta?token=${r.data.token}&didEmpresa=${clave.didEmpresa}&didEnvio=${r.data.did}`;

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
            "shippingCost": 200
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
            "getShippingLocation":
            {
                "latitute": "CREATED",
                "longitude": "2025-08-19T19:45:00Z",     // DateTime ISO8601
                "markerDescription": null,
                "markerImageUrl": null
            }

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
