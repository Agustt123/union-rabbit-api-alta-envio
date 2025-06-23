const amqp = require("amqplib");

async function sendMessage() {
  const message = {
    operador: "flexia",
    data: {
      idEmpresa: 270,
      flex: 1,
      didCliente: 1,
      didCuenta: 456,
      quien: 1,
      elim: 0,
      fullfillment: 0,
      //did: 187,
      enviosDireccionesDestino: {
        calle: "avenida siempre viva",
        numero: "12223",
        cp: "10000",
        localidad: "Ciudad",
      },
      estado: 1,
      ml_shipment_id: "123456789",
    },
  };

  try {
    const connection = await amqp.connect(
      "amqp://lightdata:QQyfVBKRbw6fBb@158.69.131.226:5672"
    ); // Conéctate a RabbitMQ
    const channel = await connection.createChannel();
    const queue = "altaEnvios1";

    await channel.assertQueue(queue, { durable: true });

    // Enviar el mensaje a la cola
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true, // Asegura que el mensaje se mantenga en la cola
    });

    console.log("Mensaje enviado:", JSON.stringify(message));

    await channel.close();
    await connection.close();
  } catch (error) {
    console.error("Error al enviar el mensaje:", error);
  }
}

// Llamar a la función para enviar el mensaje
sendMessage();
