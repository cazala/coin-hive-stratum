const WebSocket = require("ws");
const url = require("url");
const defaults = require("../config/defaults");
const Connection = require("./Connection");
const Miner = require("./Miner");
const Donation = require("./Donation");

class Proxy {
  constructor(constructorOptions = defaults) {
    let options = Object.assign({}, defaults, constructorOptions);
    this.host = options.host;
    this.port = options.port;
    this.pass = options.pass;
    this.path = options.path;
    this.ssl = options.ssl;
    this.address = options.address;
    this.user = options.user;
    this.diff = options.diff;
    this.dynamicPool = options.dynamicPool;
    this.maxMinersPerConnection = options.maxMinersPerConnection;
    this.donations = options.donations;
    this.connections = {};
    this.pools = {};
    this.wss = null;
  }

  listen(wssOptions) {
    if (wssOptions !== Object(wssOptions)) {
      wssOptions = { port: +wssOptions };
    }
    if (this.path) {
      wssOptions.path = this.path;
    }
    this.wss = new WebSocket.Server(wssOptions);
    console.log("websocket server created");
    if (wssOptions.port) {
      console.log("listening on port", wssOptions.port);
    }
    if (wssOptions.server) {
      console.log("using custom server");
    }
    this.wss.on("connection", (ws, req) => {
      console.log(`new websocket connection`);
      const params = url.parse(req.url, true).query;
      let host = this.host;
      let port = this.port;
      let pass = this.pass;
      if (params.pool && this.dynamicPool) {
        const split = params.pool.split(":");
        host = split[0] || this.host;
        port = split[1] || this.port;
        pass = split[2] || this.pass;
      }
      const donations = this.donations.map(
        donation => new Donation(donation, this.getConnection(donation.host, donation.port))
      );
      const connection = this.getConnection(host, port);
      const miner = new Miner({
        connection,
        ws,
        address: this.address,
        user: this.user,
        diff: this.diff,
        pass,
        donations
      });
      miner.connect();
    });
  }

  getConnection(host, port) {
    if (!this.connections[`${host}:${port}`]) {
      this.connections[`${host}:${port}`] = [];
    }
    const connections = this.connections[`${host}:${port}`];
    let connection = connections.find(connection => this.isAvailable(connection));
    if (!connection) {
      connection = new Connection({ host, port, ssl: this.ssl });
      connection.connect();
      connection.on("close", () => {
        console.log(`connection closed (${host}:${port})`);
      });
      connection.on("error", error => {
        console.log(`connection error (${host}:${port}):`, error.message);
      });
    }
    connections.push(connection);
    return connection;
  }

  isAvailable(connection) {
    return connection.online && connection.miners.length < this.maxMinersPerConnection;
  }

  getStats() {
    return Object.keys(this.connections).reduce(
      (stats, key) => ({
        miners:
          stats.miners + this.connections[key].reduce((miners, connection) => miners + connection.miners.length, 0),
        connections: stats.connections + this.connections[key].length
      }),
      {
        miners: 0,
        connections: 0
      }
    );
  }
}

module.exports = Proxy;
