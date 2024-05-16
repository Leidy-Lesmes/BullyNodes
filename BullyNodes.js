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
const leaderNode = { clientUrl: null };
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
    
            // Llamado a la función para programar el ping al líder después de un tiempo aleatorio
             pingLeaderAfterRandomTime();
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
        console.log('Ping recibido en el líder.');
        res.status(200).send('Ping al líder recibido correctamente.');
    } else {
        res.status(403).send('Forbidden');
    }
});

// Función para realizar el ping al nodo líder después de un tiempo aleatorio
function pingLeaderAfterRandomTime() {
    const randomTimeInSeconds = Math.floor(Math.random() * (10 - 2 + 1) + 10);
    console.log(`Ping al nodo líder después de ${randomTimeInSeconds} segundos.`);

    setTimeout(() => {
        const leaderNode = NODES.find(node => node.imLeader);
        if (leaderNode) {
            // Realizar el ping al líder
            axios.get(`${leaderNode.clientUrl}/pingLeader`)
                .then(response => {
                    console.log(`Nodo ${clientUrl} hizo ping al líder ${leaderNode.clientUrl} y obtuvo ${response.data}`);
                })
                .catch(error => {
                    console.error(`No se recibió respuesta del nodo líder ${leaderNode.clientUrl}: ${error.message}`);
                    console.log('Proponiendo una nueva elección de líder...');
                    // TODO: Implementar lógica para proponer una nueva elección de líder
                    proposeLeaderElection();
                });
        } else {
            console.error('No se encontró el nodo líder.');
        }

        // Registrar la URL del líder y la URL del nodo que está realizando el ping
        console.log(`URL del líder: ${leaderNode ? leaderNode.clientUrl : 'N/A'}`);
        console.log(`URL del nodo que está realizando el ping: ${clientUrl}`);

        pingLeaderAfterRandomTime();
    }, randomTimeInSeconds * 1000);
}


// Verificar si soy el líder antes de programar el ping al nodo líder
if (!imLeader && isAnyNodeLeader()) {
    pingLeaderAfterRandomTime();
}

function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

const TIMEOUT_DELAY = 5000; // Tiempo de espera en milisegundos (por ejemplo, 5000 para 5 segundos)

// Función para proponer una nueva elección de líder
function proposeLeaderElection() {
    console.log(`Nodo ${clientUrl} proponiendo una nueva elección de líder...`);

    // Obtener nodos con un ID mayor y que no sean líderes
    const higherNodes = NODES.filter(node => parseInt(node.id) > parseInt(NODE_ID) && !node.imLeader);

    // Enviar solicitud de elección de líder a los nodos con un ID mayor
    higherNodes.forEach(node => {
        axios.post(`${node.clientUrl}/leader-election-proposal`, { proposerUrl: clientUrl })
            .then(response => {
                console.log(`Respuesta del nodo ${node.clientUrl}: ${response.data}`);
            })
            .catch(error => {
                console.error(`Error al enviar solicitud de elección de líder al nodo ${node.clientUrl}: ${error.message}`);
            });
    });

    // Si no hay nodos con IDs mayores o ningún nodo responde, establecer imLeader = true para el nodo que está solicitando la elección
    setTimeout(() => {
        if (!higherNodes.length) {
            imLeader = true;
            console.log(`Nodo ${clientUrl} se establece como líder porque no hay nodos con IDs mayores.`);
        
            // Asignar la URL del nuevo líder a leaderNode.clientUrl
            leaderNode.clientUrl = clientUrl;

            // Establecer imLeader y clientUrl en true para el nuevo líder
            imLeader = true;

            // Actualizar la propiedad imLeader y clientUrl en el nodo que se establece como líder
            NODES = NODES.map(node => {
                if (node.clientUrl === clientUrl) {
                    return { ...node, imLeader: true, clientUrl: true };
                }
                return node;
            });
            // Emitir un evento para informar a los demás nodos sobre el nuevo líder
            socket.emit('update-node-info', { clientUrl, imLeader });
        }
    }, TIMEOUT_DELAY); // TIMEOUT_DELAY es un valor de tiempo de espera para recibir respuestas de los nodos
}

// Endpoint para manejar la solicitud de propuesta de elección de líder
app.post('/leader-election-proposal', (req, res) => {
    const proposerUrl = req.body.proposerUrl;
    console.log(`Solicitud de elección de líder recibida de ${proposerUrl}`);

    // Responder con "OK estoy en la elección"
    res.status(200).send('OK estoy en la elección');

    // Verificar si existen IDs mayores al ID del nodo actual
    const higherNodesExist = NODES.some(node => parseInt(node.id) > parseInt(NODE_ID));

    if (higherNodesExist) {
        // Continuar la propuesta de elección con nodos de ID aún más alto
        proposeLeaderElection();
    } else {
        // Si no hay nodos con IDs mayores, establecer imLeader = true para el nodo que está solicitando la elección
        imLeader = true;
        console.log(`Nodo ${clientUrl} se establece como líder porque no hay nodos con IDs mayores.`);
    }
});


const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`Servidor HTTP escuchando en el puerto ${PORT}`);
});
