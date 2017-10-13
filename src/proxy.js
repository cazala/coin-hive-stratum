const WebSocket = require("ws");
const Queue = require("./queue");
const net = require("net");
const defaults = require("../config/defaults");

function getConnection(ws) {
  log("new websocket connection");
  return {
    online: null,
    workerId: null,
    rpcId: null,
    hashes: null,
    socket: null,
    queue: null,
    ws: ws
  };
}

function createQueue(connection) {
  log("queue created");
  connection.queue = new Queue();
}

function bindWebSocket(connection) {
  connection.ws.on("message", function(message) {
    if (connection.queue) {
      connection.queue.push({
        type: "message",
        payload: message
      });
    }
  });
  connection.ws.on("close", () => {
    if (connection.queue) {
      connection.queue.push({
        type: "close",
        payload: null
      });
    }
  });
  connection.ws.on("error", error => {
    if (connection.queue) {
      connection.queue.push({
        type: "error",
        payload: error
      });
    }
  });
}

function bindQueue(connection) {
  connection.queue.on("close", () => {
    killConnection(connection);
    log("miner connection closed");
  });
  connection.queue.on("error", error => {
    killConnection(connection);
    log("miner connection error", error.message);
  });
  connection.queue.on("message", function(message) {
    log("\nmessage from miner to pool:\n\n", message);
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return log("\ncan't parse message as JSON from miner:\n\n", message);
    }
    switch (data.type) {
      case "auth": {
        let login = data.params.site_key;
        if (data.params.user) {
          login += "." + data.params.user;
        }
        sendToPool(connection, {
          id: getRpcId(connection),
          method: "login",
          params: {
            login: login,
            pass: "x"
          }
        });
        break;
      }
      case "submit": {
        sendToPool(connection, {
          id: getRpcId(connection),
          method: "submit",
          params: {
            id: connection.workerId,
            job_id: data.params.job_id,
            nonce: data.params.nonce,
            result: data.params.result
          }
        });
        break;
      }
    }
  });
}

function sendToPool(connection, payload) {
  const stratumMessage = JSON.stringify(payload) + "\n";
  connection.socket.write(stratumMessage);
  log("\nmessage sent to pool:\n\n", stratumMessage);
}

function sendToMiner(connection, payload) {
  const coinHiveMessage = JSON.stringify(payload);
  if (connection.online) {
    try {
      connection.ws.send(coinHiveMessage);
      log("\nmessage sent to miner:\n\n", coinHiveMessage);
    } catch (e) {
      log("\nsocket seems to be already closed.");
      killConnection(connection);
    }
  } else {
    log(
      "\nfailed to send message to miner cos it was offline:",
      coinHiveMessage
    );
  }
}

function getRpcId(connection) {
  return connection.rpcId++;
}

function getHashes(connection) {
  return connection.hashes++;
}

function connectSocket(connection, port, host) {
  connection.socket = new net.Socket();
  log("tcp socket created");
  connection.socket.connect(+port, host, function() {
    log("connected to pool");
    log("host", host);
    log("port", port);
    connection.online = true;
    connection.rpcId = 1;
    connection.hashes = 1;
    connection.socket.on("data", function(buffer) {
      const stratumMessage = buffer.toString("utf8");
      log("\nmessage from pool to miner:\n\n", stratumMessage);
      const data = JSON.parse(stratumMessage);
      if (data.id === 1) {
        if (data.error && data.error.code === -1) {
          return sendToMiner(connection, {
            type: "error",
            error: "invalid_site_key"
          });
        }
        connection.workerId = data.result.id;
        sendToMiner(connection, {
          type: "authed",
          params: {
            token: "",
            hashes: 0
          }
        });
        if (data.result.job) {
          sendToMiner(connection, {
            type: "job",
            params: data.result.job
          });
        }
      } else {
        if (data.method === "job") {
          sendToMiner(connection, {
            type: "job",
            params: data.params
          });
        }
        if (data.result && data.result.status === "OK") {
          sendToMiner(connection, {
            type: "hash_accepted",
            params: {
              hashes: getHashes(connection)
            }
          });
        }
      }
    });
    connection.socket.on("close", function() {
      log("connection to pool closed");
      killConnection(connection);
    });
    connection.socket.on("error", function(error) {
      log(
        "pool connection error",
        error && error.message ? error.message : error
      );
      killConnection(connection);
    });
    connection.queue.start();
    log("queue started");
  });
}

function killConnection(connection) {
  if (connection.queue) {
    connection.queue.stop();
  }
  if (connection.ws) {
    connection.ws.close();
  }
  if (connection.socket) {
    connection.socket.destroy();
  }
  connection.online = false;
  connection.socket = null;
  connection.queue = null;
  connection.ws = null;
  connection = null;
}

function createProxy(options = defaults) {
  const constructorOptions = Object.assign({}, defaults, options);
  log = function() {
    options.log && console.log.apply(null, arguments);
  };
  return {
    listen: function listen(wssOptions) {
      if (wssOptions !== Object(wssOptions)) {
        wssOptions = { port: +wssOptions };
      }
      if (options.path) {
        wssOptions.path = options.path;
      }
      const wss = new WebSocket.Server(wssOptions);
      log("websocket server created");
      log("listening on port", wssOptions.port);
      wss.on("connection", ws => {
        const connection = getConnection(ws);
        createQueue(connection);
        bindWebSocket(connection);
        bindQueue(connection);
        connectSocket(
          connection,
          +constructorOptions.port,
          constructorOptions.host
        );
      });
    }
  };
}

module.exports = createProxy;
