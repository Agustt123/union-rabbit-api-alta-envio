// aclaves-json.js
const fs = require("fs").promises;
const path = require("path");

const DATA_FILE = path.join(__dirname, "tokens.json");

let cache = [];                 // [{ token, didCliente, didCuenta, didEmpresa }]
let ready = false;
let writing = Promise.resolve(); // serializa escrituras

async function load() {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf8");
        const parsed = JSON.parse(raw);
        cache = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        if (err.code === "ENOENT") {
            await save(); // crea vacío
        } else {
            throw err;
        }
    } finally {
        ready = true;
    }
}

async function save() {
    const tmp = DATA_FILE + ".tmp";
    const json = JSON.stringify(cache, null, 2);
    await fs.writeFile(tmp, json, "utf8");
    await fs.rename(tmp, DATA_FILE);
}

async function ensureReady() {
    if (!ready) await load();
}

function validateEntry(entry) {
    if (!entry || typeof entry.token !== "string" || entry.token.trim() === "") {
        throw Object.assign(new Error("Falta 'token' string no vacío"), { status: 400 });
    }
    for (const k of ["didCliente", "didCuenta", "didEmpresa"]) {
        if (typeof entry[k] !== "number") {
            throw Object.assign(new Error(`Falta '${k}' number`), { status: 400 });
        }
    }
}

async function getAll() {
    await ensureReady();
    return cache.slice();
}

async function getByToken(token) {
    await ensureReady();
    return cache.find((e) => e.token === token) || null;
}

async function add(entry) {
    await ensureReady();
    validateEntry(entry);
    if (await getByToken(entry.token)) {
        const e = new Error("El token ya existe");
        e.code = "E_DUP";
        e.status = 409;
        throw e;
    }
    cache.push(entry);
    writing = writing.then(save, save);
    await writing;
    return entry;
}

async function remove(token) {
    await ensureReady();
    const prev = cache.length;
    cache = cache.filter((e) => e.token !== token);
    const changed = cache.length !== prev;
    if (changed) {
        writing = writing.then(save, save);
        await writing;
    }
    return changed;
}

module.exports = {
    load, getAll, getByToken, add, remove,
    _DATA_FILE: DATA_FILE,
};
