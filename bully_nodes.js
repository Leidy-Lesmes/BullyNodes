const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
const axios = require('axios');

app.use(cors());
app.use(express.json());

const port = process.env.NODE_PORT;
const nodeIp = process.env.NODE_IP;


const socketIoClient = require('socket.io-client');
const coordinatorUrl = 'http://localhost:3000';
const clientUrl = `http://${nodeIp}:${port}`; 

let SERVERS = "";


const socket = socketIoClient(coordinatorUrl, {
    query: { clientUrl: clientUrl }
});

socket.on('connect', () => {
    const currentTime = new Date().toLocaleTimeString();
    console.log(`[${currentTime}] Nodo conectado al coordinador.`);
});

socket.on('connect_error', (error) => {
    const currentTime = new Date().toLocaleTimeString();
    console.error(`[${currentTime}] Error de conexión con el coordinador: ${error.message}`);
});

socket.on('error', (error) => {
    const currentTime = new Date().toLocaleTimeString();
    console.error(`[${currentTime}] Error en el nodo: ${error.message}`);
});

// presentarse
axios.post(clientUrl, {
    ip: process.env.NODE_IP,
    port: port
})

app.post('/register-new-service', (req, res) => {
    const ip = req.ip; 
    const port = req.app.settings.port; 

    console.log(`IP: ${ip}, Puerto: ${port}`);

    // Agregar el nuevo servidor a la lista de servidores
    const newServer = `${ip}:${port}`;
    if (SERVERS) {
        SERVERS += `,${newServer}`;
    } else {
        SERVERS = newServer;
    }

    console.log("Lista de servidores actualizada:", SERVERS);

    // Enviar datos al coordinador
    axios.post(coordinatorUrl, {
        ip: ip,
        port: port
    })
    .then(response => {
        console.log('Datos enviados exitosamente al coordinador:', response.data);
        res.status(200).json({ success: true, message: 'Datos enviados exitosamente a los nodos' });
    })
    .catch(error => {
        console.error('Error al enviar datos al coordinador', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    });
});


const PORT = process.env.NODE_PORT;
server.listen(PORT, () => {
    console.log(`Cliente de WebSocket escuchando en el puerto ${PORT}`);
});
