require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();
const socketIoClient = require('socket.io-client');

app.use(cors());
app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const PORT = process.env.NODE_PORT;
const NODE_IP = process.env.NODE_IP;
const NODE_ID = process.env.NODE_ID;
let NODE_IS_LEADER = 'false';
const IP_SW = process.env.IP_SW || 'ws://localhost:4000';

let SERVERS = [];
let leader_url = '';
const NODES = new Map(); 

const clientUrl = `http://${NODE_IP}:${PORT}`;

console.log('Port ', {port: PORT}, ' IP ', {NODE_IP}, ' Lider ', {NODE_IS_LEADER}, ' SWS ', {IP_SW}, ' url client ', {clientUrl});

// Crear servidor HTTP y cliente WebSocket
const server = http.createServer(app);

const socket = socketIoClient(IP_SW, {
    query: { clientUrl: clientUrl }
});


socket.on('connect', () => {
    const currentTime = new Date().toLocaleTimeString();
    console.log(`[${currentTime}] Nodo conectado al monitor.`);
});

socket.on('connect_error', (error) => {
    const currentTime = new Date().toLocaleTimeString();
    console.error(`[${currentTime}] Error de conexión con el monitor: ${error.message}`);
});

socket.on('error', (error) => {
    const currentTime = new Date().toLocaleTimeString();
    console.error(`[${currentTime}] Error en el nodo: ${error.message}`);
});

// Endpoint HTTP para ping
app.get('/ping', (req, res) => {
    res.send('pong'); // Indicar que el servidor está activo
});

// Hacer POST a la nueva ruta en el monitor para enviar datos
axios.post('http://localhost:4000/register-node', {
    ip: NODE_IP,
    port: PORT,
    leader: NODE_IS_LEADER === 'true' ? true : false,
})
    .then((response) => {
        console.log("Datos enviados al monitor:", { ip: NODE_IP, port: PORT, leader: NODE_IS_LEADER === 'true' ? true : false });
        console.log("Respuesta del monitor:", response.data);

        // Agregar el nodo actual a la lista de servidores
        const currentNodeUrl = `http://${NODE_IP}:${PORT}`;
        if (!SERVERS.includes(currentNodeUrl)) {
            SERVERS.push(currentNodeUrl);
            console.log("Nodo registrado en la lista de SERVERS:", currentNodeUrl);
            console.log("Lista de SERVERS:", SERVERS);
        }

        // Solicitar información de liderazgo al monitor
        axios.get('http://localhost:4000/leader-info')
            .then((response) => {
                const { leaderUrl } = response.data;
                console.log("Información de liderazgo recibida del monitor:", leaderUrl);
            })
            .catch((error) => {
                console.error("Error al solicitar información de liderazgo al monitor:", error.message);
            });
    })
    .catch((error) => {
        console.error("Error al enviar datos al monitor:", error.message);
    });

// Método para manejar la actualización de la URL del líder en el nodo
app.post('/leader-update', (req, res) => {
    const { leader } = req.body;
    console.log("URL del líder recibida:", leader);

    // Asignar la URL del líder a la variable leader_url
    leader_url = leader;

    // Imprimir la URL del líder en el nodo después de que se actualiza
    console.log("URL del líder actualizada en el nodo:", leader_url);

    // Responder al monitor con un mensaje de éxito
    res.status(200).send('URL del líder recibida exitosamente');
});

// Imprimir la URL del líder en el servidor al iniciar
console.log("URL del líder recibida en el servidor:", leader_url);

// En el nodo, agregar una ruta para manejar la actualización de la lista de servidores
app.post('/update-server-list', (req, res) => {
    const { servers } = req.body;
    SERVERS = servers; // Actualizar la lista de servidores del nodo
    console.log("Lista de servidores actualizada en el nodo:", SERVERS);
    res.status(200).send('Lista de servidores actualizada exitosamente en el nodo');
});

// Función para hacer ping al líder
function pingLeader(leader_url) {
    if (leader_url === clientUrl) {
        // Si la URL del líder es igual a clientUrl, no hacer ping
        console.log('No se realiza el ping al líder porque es la misma URL que clientUrl:', leader_url);
        return;
    }

    axios.get(leader_url + '/ping') // Agrega '/ping' al final de la URL del líder
        .then((response) => {
            console.log('Ping al líder exitoso:', response.data);
        })
        .catch((error) => {
            console.error('Error al hacer ping al líder:', error.message);
        });
}


const pingInterval = 5000; // 5 segundos

// Configurar el intervalo para hacer ping al líder cada 5 segundos
setInterval(() => {
    pingLeader(leader_url);
}, pingInterval);

// Ruta para responder al ping desde el líder
app.get('/ping-leader', (req, res) => {
    res.send('ok'); // Responder al ping con "ok"
});

// Iniciar el servidor HTTP
server.listen(PORT, () => {
    console.log(`Servidor HTTP corriendo y cliente WebSocket conectado en el puerto ${PORT}`);
});
