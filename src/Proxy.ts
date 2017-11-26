import * as WebSocket from "ws";
import * as url from "url";
import * as http from "http";
import * as https from "https";
import * as defaults from "../config/defaults";
import Connection from "./Connection";
import Miner from "./Miner";
import Donation, { Options as DonationOptions } from "./Donation";
import { Dictionary, Stats, WebSocketQuery } from "src/types";
import { Request } from "_debugger";
import { ServerRequest } from "http";

export type Options = {
  host: string;
  port: number;
  pass: string;
  ssl: false;
  address: string | null;
  user: string | null;
  diff: number | null;
  dynamicPool: boolean;
  maxMinersPerConnection: number;
  donations: DonationOptions[];
  key: Buffer;
  cert: Buffer;
  path: string;
  server: http.Server | https.Server;
};

class Proxy {
  host: string = null;
  port: number = null;
  pass: string = null;
  ssl: boolean = null;
  address: string = null;
  user: string = null;
  diff: number = null;
  dynamicPool: boolean = false;
  maxMinersPerConnection: number = 100;
  donations: DonationOptions[] = [];
  connections: Dictionary<Connection[]> = {};
  wss: WebSocket.Server = null;
  key: Buffer = null;
  cert: Buffer = null;
  path: string = null;
  server: http.Server | https.Server = null;

  constructor(constructorOptions: Options = defaults) {
    let options = Object.assign({}, defaults, constructorOptions) as Options;
    this.host = options.host;
    this.port = options.port;
    this.pass = options.pass;
    this.ssl = options.ssl;
    this.address = options.address;
    this.user = options.user;
    this.diff = options.diff;
    this.dynamicPool = options.dynamicPool;
    this.maxMinersPerConnection = options.maxMinersPerConnection;
    this.donations = options.donations;
    this.key = options.key;
    this.cert = options.cert;
    this.path = options.path;
    this.server = options.server;
  }

  listen(port: number): void {
    // create server
    const isHTTPS = !!(this.key && this.cert);
    if (!this.server) {
      const stats = (req, res) => {
        const url = require("url").parse(req.url);
        if (url.pathname === "/stats") {
          const body = JSON.stringify(this.getStats(), null, 2);
          res.writeHead(200, {
            "Content-Length": Buffer.byteLength(body),
            "Content-Type": "application/json"
          });
          res.end(body);
        }
      };
      if (isHTTPS) {
        const certificates = {
          key: this.key,
          cert: this.cert
        };
        this.server = https.createServer(certificates, stats);
      } else {
        this.server = http.createServer(stats);
      }
    }
    const wssOptions: WebSocket.ServerOptions = {
      server: this.server
    };
    if (this.path) {
      wssOptions.path = this.path;
    }
    this.wss = new WebSocket.Server(wssOptions);
    this.wss.on("connection", (ws: WebSocket, req: ServerRequest) => {
      const params = url.parse(req.url, true).query as WebSocketQuery;
      let host = this.host;
      let port = this.port;
      let pass = this.pass;
      if (params.pool && this.dynamicPool) {
        const split = params.pool.split(":");
        host = split[0] || this.host;
        port = Number(split[1]) || this.port;
        pass = split[2] || this.pass;
      }
      const connection = this.getConnection(host, port);
      const donations = this.donations.map(
        donation =>
          new Donation({
            address: donation.address,
            host: donation.host,
            port: donation.port,
            pass: donation.pass,
            percentage: donation.percentage,
            connection: this.getConnection(donation.host, donation.port, true)
          })
      );
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
    this.server.listen(port);
    console.log(`listening on port ${port}` + (isHTTPS ? ", using a secure connection" : ""));
    if (wssOptions.path) {
      console.log(`path: ${wssOptions.path}`);
    }
    if (!this.dynamicPool) {
      console.log(`host: ${this.host}`);
      console.log(`port: ${this.port}`);
      console.log(`pass: ${this.pass}`);
    }
  }

  getConnection(host: string, port: number, donation: boolean = false): Connection {
    const connectionId = `${host}:${port}`;
    if (!this.connections[connectionId]) {
      this.connections[connectionId] = [];
    }
    const connections = this.connections[connectionId];
    const availableConnections = connections.filter(connection => this.isAvailable(connection));
    if (availableConnections.length === 0) {
      const connection = new Connection({ host, port, ssl: this.ssl, donation });
      connection.connect();
      connection.on("close", () => {
        console.log(`connection closed (${connectionId})`);
      });
      connection.on("error", error => {
        console.log(`connection error (${connectionId}):`, error.message);
      });
      connections.push(connection);
      return connection;
    }
    while (availableConnections.length > 1) {
      const unusedConnection = availableConnections.pop();
      unusedConnection.kill();
    }
    return availableConnections.pop();
  }

  isAvailable(connection: Connection): boolean {
    return connection.online && connection.miners.length < this.maxMinersPerConnection;
  }

  getStats(): Stats {
    return Object.keys(this.connections).reduce(
      (stats, key, index) => ({
        miners:
          stats.miners + this.connections[key].reduce((miners, connection) => miners + connection.miners.length, 0),
        connections: stats.connections + this.connections[key].filter(connection => !connection.donation).length
      }),
      {
        miners: 0,
        connections: 0
      }
    );
  }

  kill() {
    Object.keys(this.connections).forEach(connectionId => {
      const connections = this.connections[connectionId];
      connections.forEach(connection => {
        connection.kill();
        connection.miners.forEach(miner => miner.kill());
      });
    });
    this.wss.close();
  }
}

export default Proxy;
