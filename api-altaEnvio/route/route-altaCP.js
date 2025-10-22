const express = require("express");
const { altaCP } = require("../controllerAlta/altaCP");
const { getConnection, getCompanyById } = require("../dbconfig");
const alta = express.Router();

alta.post("/", async (req, res) => {
    console.log("!");

    const data = req.body;
    const connection = await getConnection(data.companyId);
    try {
        const company = await getCompanyById(data.companyId);
        const result = await altaCP(connection, data, company);
        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    } finally {
        connection.end();
    }
})

module.exports = { alta }