require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIoClient = require('socket.io-client');

const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.NODE_PORT;
const NODE_IP = process.env.NODE_IP;
const NODE_ID = process.env.NODE_ID;
const IP_SW = process.env.IP_SW || 'http://localhost:4000';

const clientUrl = `http://${NODE_IP}:${PORT}`;
let imLeader = false;
let imActive = true;
let NODES = [];

console.log('Port ', PORT, ' IP ', NODE_IP, ' ID ', NODE_ID, ' SWS ', IP_SW, ' url client ', clientUrl);

// Crear una instancia del cliente de WebSocket y conectarse al servidor
const socket = socketIoClient(IP_SW, {
    query: { clientUrl: clientUrl }
});

async function updateNodesList() {
    try {
        const servers = await new Promise((resolve) => {
            socket.on('servers_list', (servers) => {
                resolve(servers);
            });
        });
        NODES = servers;
        console.log('Lista de nodos actualizada', NODES);
        isAnyNodeLeader();

        // Verificar si este nodo ya está marcado como líder en la lista de nodos
        const currentNode = NODES.find(node => node.clientUrl === clientUrl);

        if (!currentNode || !imLeader) {
            console.log('Verificando si este nodo debería ser líder...');
            console.log('Nodos con ID mayor:', getNodesWithHigherId());
            // Verificar si ningún otro nodo está marcado como líder
            const noOtherLeader = NODES.every(node => node.clientUrl === clientUrl || !node.imLeader);
            console.log('¿Ningún otro nodo es líder?', noOtherLeader);
            if (noOtherLeader) {
                console.log('No hay nodos con ID mayor y ningún otro nodo es líder. Este nodo es el nuevo líder.');
                imLeader = true;
                NODES = NODES.map(node => {
                    if (node.id === NODE_ID) {
                        return { ...node, imLeader: true };
                    }
                    return node;
                });

                socket.emit('update-node-info', { clientUrl, imLeader });

            } else {
                console.log('Este nodo ya está marcado como líder en la lista de nodos o hay otros líderes.');
            }
        } else {
            console.log('Este nodo ya está marcado como líder en la lista de nodos.');
        }
        // Verificar si este nodo identifica un líder en la lista de nodos
        const leaderNode = NODES.find(node => node.imLeader);
        if (leaderNode && leaderNode.clientUrl !== clientUrl) {
            // Si hay un líder en la lista de nodos y no es este nodo, realizar el ping al nodo líder
            console.log(`Identificado un líder en la lista de nodos: ${leaderNode.clientUrl}`);
            const randomTimeInSeconds = Math.floor(Math.random() * (5 - 2 + 1) + 10);
            console.log(`Ping al nodo líder después de ${randomTimeInSeconds} segundos.`);

            // Realizar el ping al nodo líder
            axios.get(`${leaderNode.clientUrl}/pingLeader`)
                .then(response => {
                    console.log('Ping al nodo líder exitoso.');
                })
                .catch(error => {
                    console.error(`No se recibió respuesta del nodo líder: ${error.message}`);
                    console.log('Proponiendo una nueva elección de líder...');
                    // TODO: Implementar lógica para proponer una nueva elección de líder
                });
        }
    } catch (error) {
        console.error(`Error al actualizar la lista de nodos: ${error.message}`);
    }
}

// Enviar solicitud para obtener la lista de servidores cuando se conecta el cliente
socket.on('connect', () => {
    const currentTime = new Date().toLocaleTimeString();
    console.log(`[${currentTime}] Nodo conectado al monitoreo.`);

    // Enviar datos al servidor después de la conexión exitosa
    socket.emit('node_data', {
        clientUrl: clientUrl,
        id: NODE_ID,
        imLeader: imLeader
    });

    updateNodesList();
});

socket.on('servers_list', (servers) => {
    NODES = servers;
    console.log('Lista de nodos actualizada');
});

socket.on('connect_error', (error) => {
    const currentTime = new Date().toLocaleTimeString();
    console.error(`[${currentTime}] Error de conexión con el monitoreo: ${error.message}`);
});

socket.on('error', (error) => {
    const currentTime = new Date().toLocaleTimeString();
    console.error(`[${currentTime}] Error en el nodo: ${error.message}`);
});

// Manejar eventos de WebSocket
socket.on('logs', (message) => {
    console.log(message);
});

// Endpoint HTTP para ping del monitoreo
app.get('/ping', (req, res) => {
    if (imActive) {
        res.end('pong');
    } else {
        res.writeHead(403);
    }
});

// Cambiar el estado del nodo a "inactivo"
app.post('/set-inactive', (req, res) => {
    imActive = false;
    res.status(200).send('El estado del nodo se ha cambiado a "inactivo"');
    console.log(`Nodo activo `, imActive);
});


// Función para obtener los nodos con ID mayor que el del nodo actual
function getNodesWithHigherId() {
    return NODES.filter(node => parseInt(node.id) > parseInt(NODE_ID));
}

// Función para verificar si alguno de los nodos en la lista es líder
function isAnyNodeLeader() {
    const anyLeader = NODES.some(node => node.imLeader);
    console.log(`¿Alguno de los nodos es líder? ${anyLeader}`);
    return anyLeader;
}

// Endpoint para el ping del líder
app.get('/pingLeader', (req, res) => {
    if (imActive) {
        res.end('pong');
        console.log('Ping recibido en el líder.');
        res.status(200).send('Ping al líder recibido correctamente.');
    }
});

// Función para realizar el ping al nodo líder después de un tiempo aleatorio
function pingLeaderAfterRandomTime() {
    const randomTimeInSeconds = Math.floor(Math.random() * (10 - 2 + 1) + 10);
    console.log(`Ping al nodo líder después de ${randomTimeInSeconds} segundos.`);

    setTimeout(() => {
        const leaderNode = NODES.find(node => node.imLeader);

        if (leaderNode) {
            axios.get(`${leaderNode.clientUrl}/pingLeader`)
                .then(response => {
                    console.log(`Ping al nodo líder (${leaderNode.clientUrl}) exitoso.`);
                })
                .catch(error => {
                    console.error(`Error en el ping al nodo líder (${leaderNode.clientUrl}): ${error.message}`);
                });
        } else {
            console.error('No se encontró el nodo líder.');
        }
    }, randomTimeInSeconds * 1000);
}

// Verificar si soy el líder antes de programar el ping al nodo líder
if (!imLeader && isAnyNodeLeader()) {
    pingLeaderAfterRandomTime();
}

function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`Servidor HTTP escuchando en el puerto ${PORT}`);
});
