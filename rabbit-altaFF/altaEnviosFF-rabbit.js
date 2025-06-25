const amqp = require("amqplib");
const { getCompanyById, getConnection } = require("./dbconfig");
const { AltaEnvio } = require("./controllerAlta/controllerAltaEnvio");

async function startConsumer() {
  let connection, channel;

  try {
    connection = await amqp.connect(
      "amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672"
    );
    channel = await connection.createChannel();

    const queue = "insertFF";
    await channel.assertQueue(queue, { durable: true });

    console.log("Esperando mensajes en la cola:", queue);

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        try {
          const data = JSON.parse(msg.content.toString());
          const idEmpresa = data.data.didEmpresa;

          const empresasExcluidas = [149, 44, 86, 36]; // IDs a ignorar

          if (empresasExcluidas.includes(idEmpresa)) {
            console.log(`Mensaje con idEmpresa ${idEmpresa} ignorado.`);
            return channel.ack(msg);
          }

          if (idEmpresa == 999) {
            console.log("Procesando mensaje para idEmpresa 315:", data);

            // const connectionDb = await getConnection(idEmpresa);
            const company = await getCompanyById(idEmpresa);
            console.log(JSON.stringify(data));
            // console.log(company, "company");

            await AltaEnvio(company, data);

            channel.ack(msg);
          } else {
            // console.log(`Mensaje con idEmpresa ${idEmpresa} recibido pero no procesado.`);

            // Si no es 97 ni excluida, solo confirmo sin procesar
            channel.ack(msg);
          }
        } catch (error) {
          console.error("Error procesando el mensaje:", error);
          // Nack con reintento
          channel.nack(msg);
        }
      }
    });
  } catch (error) {
    console.error("Error en el consumidor de RabbitMQ:", error);
    // Aquí no hay 'msg' para hacer nack, solo loguear el error
  }
}

startConsumer();
