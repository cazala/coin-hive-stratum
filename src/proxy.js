const WebSocket = require("ws");
const net = require("net");
const tls = require("tls");
const fs = require("fs");
const moment = require("moment");
const Queue = require("./queue");
const defaults = require("../config/defaults");

/*********************** MINER CONNECTIONS  ***********************/

const minerConnections = {};

let lastConnectionId = 0;
function createConnection(ws, options) {
  log("new miner connection");
  const id = lastConnectionId++;
  const connection = {
    id: id,
    address: null,
    online: true,
    workerId: null,
    connected: false,
    hashes: 0,
    authId: null,
    socket: null,
    buffer: "",
    ws: ws,
    host: options.host,
    port: options.port,
    pass: options.pass,
    tls: options.tls,
    login: options.login,
    user: options.user,
    diff: options.diff,
    donation: false
  };
  connection.ws.on("message", function(message) {
    if (!connection.connected) {
      var data = JSON.parse(message);
      if (data.type == "auth") {
        connection.address = data.params.site_key;
        if (!getPoolConnection(connection)) {
          createPoolConnection(connection);
        }
      }
    }
    const poolConnection = getPoolConnection(connection);
    if (poolConnection) {
      poolConnection.queue.push({
        type: "message",
        payload: {
          id: id,
          message: message
        }
      });
    } else {
      destroyConnection(connection);
    }
  });
  connection.ws.on("close", () => {
    if (connection.online) {
      log(`miner connection closed (${connection.workerId})`);
      destroyConnection(connection);
    }
  });
  connection.ws.on("error", error => {
    if (connection.online) {
      log(`miner connection error (${connection.workerId})`, error && error.message ? error.message : error);
      destroyConnection(connection);
    }
  });
  minerConnections[id] = connection;
  return connection;
}

function getConnections() {
  return Object.keys(minerConnections).map(key => minerConnections[key]);
}

function getConnectionByWorkerId(workerId) {
  return getConnections().find(connection => connection.workerId === workerId);
}

function getConnectionByRpcId(workerId) {
  return Object.keys(minerConnections).find(key => minerConnections[key].workerId === workerId);
}

function getHashes(connection) {
  return ++connection.hashes;
}

function destroyConnection(connection) {
  if (!connection || !connection.online) {
    return;
  }
  const poolConnection = getPoolConnection(connection);
  if (poolConnection) {
    poolConnection.miners--;
    poolConnection.connections = poolConnection.connections.filter(x => x.id != connection.id);
  }
  if (connection.ws) {
    connection.ws.close();
  }
  log(`miner conection destroyed (${connection.workerId})`);
  connection.address = null;
  connection.online = false;
  connection.workerId = null;
  connection.connected = false;
  connection.hashes = 0;
  connection.authId = null;
  connection.socket = null;
  connection.buffer = null;
  connection.ws = null;
  connection.host = null;
  connection.port = null;
  connection.pass = null;
  connection.tls = null;
  connection.login = null;
  connection.user = null;
  connection.diff = null;
  delete minerConnections[connection.id];
  connection = null;
}

/*********************** POOL CONNECTIONS  ***********************/

const poolConnections = {};
function getPoolConnectionId(connection) {
  return connection.host + ":" + connection.port + ":" + connection.address;
}

function getPoolConnection(connection) {
  return (connection.donation ? donationConnections : poolConnections)[getPoolConnectionId(connection)];
}

function createPoolConnection(connection) {
  log(`new pool connection (${connection.address})`);
  log(`host: ${connection.host}`);
  log(`port: ${connection.port}`);
  log(`pass: ${connection.pass || ""}`);
  const id = getPoolConnectionId(connection);
  const poolConnection = {
    id: id,
    online: false,
    address: connection.address,
    host: connection.host,
    port: connection.port,
    pass: connection.pass,
    rpcId: 0,
    buffer: "",
    auths: {},
    rpc: {},
    miners: 0,
    queue: new Queue(),
    connections: [],
    jobs: [],
    pending: [],
    submitted: [],
    donation: connection.donation,
    percentage: connection.percentage
  };

  if (connection.donation) {
    donationConnections[id] = poolConnection;
  } else {
    poolConnections[id] = poolConnection;
    poolConnection.connections.push(connection);
    poolConnection.queue.on("message", minerMessageHandler);
  }

  const connectionHandler = (connection.donation ? donationConnectionFactory : socketConnectionFactory)(poolConnection);

  if (connection.tls) {
    log("using TLS");
    poolConnection.socket = tls.connect(
      +connection.port,
      connection.host,
      { rejectUnauthorized: false },
      connectionHandler
    );
  } else {
    poolConnection.socket = net.connect(+connection.port, connection.host, connectionHandler);
  }

  poolConnection.socket.setEncoding("utf-8");
  poolConnection.socket.setKeepAlive(true);

  poolConnection.socket.on("close", function() {
    log(`pool connection closed (${poolConnection.address})`);
    destroyPoolConnection(poolConnection);
  });
  poolConnection.socket.on("error", function(error) {
    log(`pool connection error (${poolConnection.address})`, error.message);
    destroyPoolConnection(poolConnection);
  });

  return poolConnection;
}

function getRpcId(connection) {
  const poolConnection = getPoolConnection(connection);
  if (poolConnection) {
    const rpcId = ++poolConnection.rpcId;
    poolConnection.rpc[rpcId] = connection;
    return rpcId;
  }
  log("Can't get rpcId, invalid pool connection");
  return -1;
}

function destroyPoolConnection(poolConnection) {
  if (poolConnection.queue) {
    poolConnection.queue.stop();
  }
  if (poolConnection.socket) {
    poolConnection.socket.destroy();
  }
  log(`pool connection destroyed (${poolConnection.address})`);
  poolConnection.connections.forEach(connection => destroyConnection(connection));
  poolConnection.online = false;
  poolConnection.address = null;
  poolConnection.host = null;
  poolConnection.port = null;
  poolConnection.pass = null;
  poolConnection.lastRpcId = null;
  poolConnection.buffer = null;
  poolConnection.auths = null;
  poolConnection.miners = 0;
  poolConnection.queue = null;
  poolConnection.connections = [];
  poolConnection.jobs = [];
  poolConnection.pending = [];
  poolConnection.submitted = [];
  poolConnection.donation = false;
  poolConnection.percentage = 0;
  delete poolConnections[poolConnection.id];
  poolConnection = null;
}

/*********************** ORCHESTRATION  ***********************/

function socketConnectionFactory(poolConnection) {
  return err => {
    if (err) {
      return log("error while connecting socket");
    }
    poolConnection.online = true;
    poolConnection.socket.on("data", function(chunk) {
      poolConnection.buffer += chunk;
      while (poolConnection.buffer && poolConnection.buffer.includes("\n")) {
        const newLineIndex = poolConnection.buffer.indexOf("\n");
        const stratumMessage = poolConnection.buffer.slice(0, newLineIndex);
        poolConnection.buffer = poolConnection.buffer.slice(newLineIndex + 1);
        log(`message from pool (${poolConnection.address}):`, stratumMessage);
        let data = null;
        try {
          data = JSON.parse(stratumMessage);
        } catch (e) {
          return log(`[ERROR] invalid stratum message`);
        }
        if (poolConnection.auths[data.id]) {
          const connection = poolConnection.auths[data.id];
          delete poolConnection.auths[data.id];
          if (data.error && data.error.code === -1) {
            return sendToMiner(connection, {
              type: "error",
              params: {
                error: "invalid_site_key"
              }
            });
          }
          poolConnection.miners++;
          connection.connected = true;
          connection.workerId = data.result.id;
          log(`miner authenticated (${(connection.workerId = data.result.id)})`);
          log(
            `${poolConnection.miners === 1
              ? `there is 1 miner`
              : `there are ${poolConnection.miners} miners`} on this pool connection (${poolConnection.address})`
          );
          sendToMiner(connection, {
            type: "authed",
            params: {
              token: "",
              hashes: 0
            }
          });
          if (data.result.job) {
            sendJob(connection, data.result.job);
          }
        } else {
          if (data.method === "job") {
            const connection = getConnectionByWorkerId(data.params.id);
            sendJob(connection, data.params);
          }
          if (data.result && data.result.status === "OK") {
            const connection = poolConnection.rpc[data.id];
            sendToMiner(connection, {
              type: "hash_accepted",
              params: {
                hashes: getHashes(connection)
              }
            });
          }
          if (data.error && data.error.code === -1) {
            const connection = poolConnection.rpc[data.id];
            destroyConnection(connection);
          }
        }
        if (data.id) {
          delete poolConnection.rpc[data.id];
        }
      }
    });
    poolConnection.queue.start();
  };
}

function minerMessageHandler(event, donationConnection) {
  let data;
  try {
    data = JSON.parse(event.message);
  } catch (e) {
    return log("can't parse message as JSON from miner:", event.message);
  }

  var connection = donationConnection || minerConnections[event.id];
  if (!connection) {
    return log(`unknown connection ${event.id}`, event.message);
    return;
  }

  var poolConnection = donationConnection || getPoolConnection(connection);
  if (!poolConnection) {
    return log(`unknown pool connection ${getPoolConnectionId(connection)}`, event.message);
    return;
  }

  log(`message from miner (${connection.workerId || "unauthenticated"})`, event.message);

  switch (data.type) {
    case "auth": {
      let login = connection.login || data.params.site_key;
      const user = connection.user || data.params.user;
      const diff = connection.diff;
      if (user) {
        login += "." + user;
      }
      if (diff) {
        login += "+" + diff;
      }
      var rpcId = getRpcId(connection);
      poolConnection.auths[rpcId] = connection;
      sendToPool(poolConnection, {
        id: rpcId,
        method: "login",
        params: {
          login: login,
          pass: connection.pass
        }
      });
      break;
    }
    case "submit": {
      const donation = getDonation(connection, data.params.job_id);
      if (donation) {
        sendToPool(donation.connection, {
          id: getRpcId(donation.connection),
          method: "submit",
          params: {
            id: donation.workerId,
            job_id: data.params.job_id,
            nonce: data.params.nonce,
            result: data.params.result
          }
        });
        sendToMiner(connection, {
          type: "hash_accepted",
          params: {
            hashes: getHashes(connection)
          }
        });
      } else {
        sendToPool(poolConnection, {
          id: getRpcId(connection),
          method: "submit",
          params: {
            id: connection.workerId,
            job_id: data.params.job_id,
            nonce: data.params.nonce,
            result: data.params.result
          }
        });
      }
      break;
    }
  }
}

function sendToPool(poolConnection, payload) {
  const stratumMessage = JSON.stringify(payload);
  poolConnection.socket.write(stratumMessage + "\n");
  log(`message sent to pool (${poolConnection.address}):`, stratumMessage);
}

function sendToMiner(connection, payload) {
  const coinHiveMessage = JSON.stringify(payload);
  if (connection && connection.online) {
    try {
      connection.ws.send(coinHiveMessage);
      log(`message sent to miner (${connection.workerId}):`, coinHiveMessage);
    } catch (e) {
      log("socket seems to be already closed.");
      destroyConnection(connection);
    }
  }
}

function sendJob(connection, job) {
  if (!connection) {
    return;
  }
  const donation = getDonationJob(connection);
  if (donation) {
    job = donation;
  }
  if (job) {
    sendToMiner(connection, {
      type: "job",
      params: job
    });
  }
}

/*********************** STATS ***********************/

function getStats() {
  const stats = {};
  stats.miners = getConnections().length;
  stats.byAddress = {};
  Object.keys(poolConnections).forEach(key => {
    const connection = poolConnections[key];
    stats.byAddress[connection.address] = connection.miners;
  });
  return stats;
}

/*********************** DONATIONS ***********************/

const donationConnections = {};
function donationConnectionFactory(donationConnection) {
  return err => {
    loginDonationConnection(donationConnection);
    donationConnection.online = true;
    donationConnection.socket.on("data", function(chunk) {
      donationConnection.buffer += chunk;
      while (donationConnection.buffer && donationConnection.buffer.includes("\n")) {
        const newLineIndex = donationConnection.buffer.indexOf("\n");
        const stratumMessage = donationConnection.buffer.slice(0, newLineIndex);
        donationConnection.buffer = donationConnection.buffer.slice(newLineIndex + 1);
        log(`message from pool (${donationConnection.address}):`, stratumMessage);
        let data = null;
        try {
          data = JSON.parse(stratumMessage);
        } catch (e) {
          return log(`[ERROR] invalid stratum message`);
        }
        if (donationConnection.auths[data.id]) {
          delete donationConnection.auths[data.id];
          if (data.error && data.error.code === -1) {
            destroyPoolConnection(donationConnection);
          }
          if (data.result.job) {
            const job = data.result.job;
            donationConnection.jobs.push(job);
            donationConnection.jobs = donationConnection.jobs.slice(-100);
          }
        } else {
          if (data.method === "job") {
            const job = data.params;
            donationConnection.jobs.push(job);
          }
          if (data.result && data.result.status === "OK") {
            // submitted
          }
        }
        if (data.id) {
          delete donationConnection.rpc[data.id];
        }
      }
    });
    donationConnection.queue.start();
  };
}

function loginDonationConnection(donationConnection) {
  minerMessageHandler(
    {
      message: JSON.stringify({
        type: "auth",
        params: {
          site_key: donationConnection.address,
          type: "anonymous",
          user: null,
          goal: 0
        }
      })
    },
    donationConnection
  );
}

function getDonations() {
  return Object.keys(donationConnections)
    .map(key => donationConnections[key])
    .sort((a, b) => (a.percentage > b.percentage ? 1 : -1));
}

function getDonation(connection, jobId) {
  const donations = getDonations();
  let donationConnection = null;
  let job = null;
  donations.forEach(donation => {
    if (donation.pending.some(pending => pending.job.job_id === jobId)) {
      const pending = donation.pending.find(pending => pending.job.job_id === jobId);
      job = pending.job;
      donationConnection = donation;
      donationConnection.pending = donation.pending.filter(pending => pending.job.job_id !== jobId);
      donationConnection.submitted.push(jobId);
      donationConnection.submitted = donationConnection.submitted.slice(-100);
    }
  });
  if (job) {
    return {
      workerId: job.id,
      connection: donationConnection
    };
  }
  return null;
}

function getDonationJob(connection) {
  const donations = getDonations();
  const chances = Math.random();
  let acc = 0;
  let i = 0;
  let job = null;
  while (job == null && i < donations.length) {
    const donation = donations[i];
    if (chances > acc && chances < donation.percentage + acc && donation.jobs.length > 0) {
      job = donation.jobs.pop();
      donation.pending.push({
        job: job,
        connection: connection
      });
    }
    acc += donation.percentage;
    i++;
  }
  return job;
}

/*********************** PROXY  ***********************/

function createProxy(constructorOptions = defaults) {
  let options = Object.assign({}, defaults, constructorOptions);
  log = function() {
    const logString = "[" + moment().format("MMM Do hh:mm") + "] " + Array.prototype.slice.call(arguments).join(" ");
    if (options.log) {
      console.log(logString);
    }
    if (typeof options.logFile === "string") {
      fs.appendFile(options.logFile || "proxy.log", logString + "\n", err => {
        if (err) {
          // error saving logs
        }
      });
    }
  };
  if (options.statsFile) {
    setInterval(() => {
      const statsFile = options.statsFile || "proxy.stats";
      fs.writeFile(statsFile, JSON.stringify(getStats(), null, 2), err => {
        if (err) {
          log(`error saving stats in "${statsFile}"`);
        }
      });
    }, 1000);
  }
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
      if (wssOptions.port) {
        log("listening on port", wssOptions.port);
      }
      if (wssOptions.server) {
        log("using custom server", wssOptions.port);
      }
      wss.on("connection", (ws, req) => {
        const params = require("url").parse(req.url, true).query;
        if (params.pool && options.dynamicPool) {
          const split = params.pool.split(":");
          options.host = split[0] || options.host;
          options.port = split[1] || options.port;
          options.pass = split[2] || options.pass;
        }
        options.donations.forEach(donation => {
          const donationConnection = {
            address: donation.address,
            host: donation.host,
            port: donation.port,
            pass: donation.pass,
            tls: donation.tls,
            donation: true,
            percentage: donation.percentage
          };
          const donationPoolConnection = getPoolConnection(donationConnection);
          if (!donationPoolConnection) {
            createPoolConnection(donationConnection);
          } else {
            loginDonationConnection(donationPoolConnection);
          }
        });
        const connection = createConnection(ws, options);
      });
    }
  };
}

module.exports = createProxy;
