require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.NODE_PORT;
const NODE_IP = process.env.NODE_IP;
const NODE_ID = process.env.NODE_ID;
const NODE_IS_LEADER = 'true';
const IP_SW = process.env.IP_SW || 'ws://localhost:4000';

const clientUrl = `http://${NODE_IP}:${PORT}`;

console.log('Port ', {PORT}, ' IP ', {NODE_IP}, ' Lider ', {NODE_IS_LEADER}, ' SWS ', {IP_SW}, ' url client ', {clientUrl});

// Crear servidor HTTP y cliente WebSocket
const server = http.createServer(app);
const wsClient = new WebSocket(IP_SW);

// Conexión WebSocket y manejo de eventos
wsClient.on('open', () => {
    console.log(`Conectado al servidor WebSocket: ${IP_SW}`); 
    wsClient.send(
        JSON.stringify({
            nodeId: NODE_ID,
            isLeader: NODE_IS_LEADER, // Asegúrate de que esté definida
            message: `Nodo ${NODE_ID} conectado`,
        })
    );
});

wsClient.on('error', (error) => {
    console.error('Error en la conexión WebSocket:', error.message);
});

wsClient.on('close', () => {
    console.log('Conexión WebSocket cerrada.');
});

wsClient.on('message', (message) => {
    console.log('Mensaje recibido:', message);
});

// Endpoint HTTP para ping
app.get('/ping', (req, res) => {
    res.send('pong'); // Indicar que el servidor está activo
});

// Hacer POST a `clientUrl` para enviar datos
axios.post(clientUrl, {
    ip: NODE_IP,
    port: PORT,
})
.then((response) => {
    console.log("Datos enviados con éxito:", response.data);
})
.catch((error) => {
    console.error("Error al enviar datos:", error.message);
});

// Endpoint para registrar un nuevo servicio
app.post('/register-new-service', (req, res) => {
    const ip = req.ip; 
    const port = req.body.port; // Usar `req.body` para obtener el puerto

    console.log(`IP: ${ip}, Puerto: ${port}`);

    // Actualizar lista de servidores
    let SERVERS = `${ip}:${port}`; // Asegurar variable inicializada

    console.log("Lista de servidores actualizada:", SERVERS);

    // Enviar datos al coordinador
    axios.post(coordinatorUrl, {
        ip,
        port,
    })
    .then((response) => {
        console.log('Datos enviados con éxito al coordinador:', response.data);
        res.status(200).json({ success: true, message: 'Datos enviados exitosamente' });
    })
    .catch((error) => {
        console.error('Error al enviar datos al coordinador:', error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    });
});

// Iniciar el servidor HTTP
server.listen(PORT, () => {
    console.log(`Servidor HTTP corriendo y cliente WebSocket conectado en el puerto ${PORT}`);
});
