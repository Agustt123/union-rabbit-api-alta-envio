const axios = require('axios');

async function descargarFoto({ idEmpresa, did, nombreFoto }, res) {
    const url = `https://files.lightdata.app/upload/${idEmpresa}/envios-fotos/${did}/${nombreFoto}`;
    console.log(`Descargando foto desde: ${url}`);


    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });

        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Disposition', `attachment; filename="${nombreFoto}"`);
        res.send(response.data);
    } catch (err) {
        console.error("Error al descargar la imagen:", err);
        res.status(500).send('Error al descargar la imagen');
    }
}
module.exports = {
    descargarFoto
}