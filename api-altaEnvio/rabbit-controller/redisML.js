const amqp = require("amqplib");

const { envioExterior } = require("../controllerAlta/controllerAltaEnvioExteriores");

async function startConsumer() {
    let connection, channel;

    try {
        connection = await amqp.connect(
            "amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672"
        );
        channel = await connection.createChannel();

        const queue = "enviosMLREDIS";
        await channel.assertQueue(queue, { durable: true });

        console.log("Esperando mensajes en la cola:", queue);

        channel.consume(queue, async (msg) => {
            if (msg !== null) {
                try {
                    const data = JSON.parse(msg.content.toString());
                    const idEmpresa = data.didEmpresa;











                    await envioExterior(data);

                    channel.ack(msg);

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
