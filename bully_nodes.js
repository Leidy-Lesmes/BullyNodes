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
let status = 'activo';
const IP_SW = process.env.IP_SW || 'ws://localhost:4000';

let SERVERS = [];
let leader_url = '';

const clientUrl = `http://${NODE_IP}:${PORT}`;

console.log('Port ', { port: PORT }, ' IP ', { NODE_IP }, ' Lider ', { NODE_IS_LEADER }, ' SWS ', { IP_SW }, ' url client ', { clientUrl });

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

// Función para verificar si el nodo está activo
function isActive() {
    return status === 'activo';
}

// Endpoint HTTP para ping
app.get('/ping', (req, res) => {
    if (isActive()) {
        res.send('pong'); // Indicar que el servidor está activo
    } else {
        res.status(403).send('El nodo está inactivo'); // Devolver un error 403 Forbidden si el nodo está inactivo
    }
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

        // Agregar el nodo actual a la lista de servidores si está activo
        if (isActive()) {
            const currentNodeUrl = `http://${NODE_IP}:${PORT}`;
            if (!SERVERS.includes(currentNodeUrl)) {
                SERVERS.push(currentNodeUrl);
                console.log("Nodo registrado en la lista de SERVERS:", currentNodeUrl);
                console.log("Lista de SERVERS:", SERVERS);
            }
        }
        
        // Solicitar información de liderazgo al monitor solo si está activo
        if (isActive()) {
            axios.get('http://localhost:4000/leader-info')
            .then((response) => {
                const { leaderUrl } = response.data;
                console.log("Información de liderazgo recibida del monitor:", leaderUrl);

                // Llamar a la función para hacer ping al líder después de recibir la URL del líder
                pingLeader(leaderUrl);

                // Actualizar la URL del líder en el nodo
                axios.post('http://localhost:4000/leader-update', {
                    leader: leaderUrl
                })
                .then((response) => {
                    console.log("Respuesta al actualizar la URL del líder:", response.data);
                })
                .catch((error) => {
                    console.error("Error al actualizar la URL del líder:", error.message);
                });
            })
            .catch((error) => {
                console.error("Error al solicitar información de liderazgo al monitor:", error.message);
            });
        }
        
    })
    .catch((error) => {
        console.error("Error al enviar datos al monitor:", error.message);
    });

// En el nodo, agregar una ruta para manejar la actualización de la lista de servidores
app.post('/update-server-list', (req, res) => {
    if (isActive()) {
        const { servers } = req.body;
        SERVERS = servers; // Actualizar la lista de servidores del nodo
        console.log("Lista de servidores actualizada en el nodo:", SERVERS);
        res.status(200).send('Lista de servidores actualizada exitosamente en el nodo');
    } else {
        res.status(403).send('El nodo está inactivo'); // Devolver un error 403 Forbidden si el nodo está inactivo
    }
});

// Función para hacer ping al líder
function pingLeader(leaderUrl) {
    if (isActive()) {
        if (leader_url) {
            console.log('Configuración de la petición HTTP:', axios.get(leader_url).config);
            axios.get(leader_url + '/ping') // Agrega '/ping' al final de la URL del líder
                .then((response) => {
                    console.log('Ping al líder exitoso:', response.data);
                })
                .catch((error) => {
                    console.error('Error al hacer ping al líder:', error.message);
                });
        } else {
            console.log('No se ha recibido la URL del líder aún.');
        }
    } else {
        console.log('El nodo está inactivo');
    }
}

const pingInterval = 5000; // 5 segundos

// Configurar el intervalo para hacer ping al líder cada 5 segundos
setInterval(() => {
    if (leader_url) {
        pingLeader(leader_url);
    } else {
        console.log('No se ha recibido la URL del líder aún.');
    }
}, pingInterval);

// Ruta para responder al ping desde el líder
app.get('/ping-leader', (req, res) => {
    res.send('ok'); // Responder al ping con "ok"
});


// Ruta para cambiar el estado del nodo a "inactivo"
app.post('/set-inactive', (req, res) => {
    // Cambiar el estado del nodo a "inactivo"
    status = 'inactivo';
    console.log('Nodo activo ', );
    res.status(200).send('El estado del nodo se ha cambiado a "inactivo"');
})


// Iniciar el servidor HTTP
server.listen(PORT, () => {
    console.log(`Servidor HTTP corriendo y cliente WebSocket conectado en el puerto ${PORT}`);
});
