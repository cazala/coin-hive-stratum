import * as EventEmitter from "events";
import * as WebSocket from "ws";
import * as url from "url";
import * as http from "http";
import * as https from "https";
import * as defaults from "../config/defaults";
import Connection from "./Connection";
import Miner from "./Miner";
import Donation, { Options as DonationOptions } from "./Donation";
import {
  Dictionary,
  Stats,
  WebSocketQuery,
  ErrorEvent,
  CloseEvent,
  AcceptedEvent,
  FoundEvent,
  JobEvent,
  AuthedEvent,
  OpenEvent,
  Credentials
} from "./types";
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
  credentials: Credentials;
};

class Proxy extends EventEmitter {
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
  credentials: Credentials = null;
  online: boolean = false;

  constructor(constructorOptions: Partial<Options> = defaults) {
    super();
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
    this.credentials = options.credentials;
    this.on("error", error => {
      /* prevent unhandled proxy errors from stopping the proxy */
      console.error("proxy error:", error.message);
    });
  }

  listen(port: number, host?: string, callback?: () => void): void {
    const version = require("../package").version;
    console.log(`coin-hive-stratum v${version}`);
    if (this.online) {
      this.kill();
    }
    // create server
    const isHTTPS = !!(this.key && this.cert);
    if (!this.server) {
      const stats = (req: http.ServerRequest, res: http.ServerResponse) => {
        if (this.credentials) {
          const auth = require("basic-auth")(req);
          if (!auth || auth.name !== this.credentials.user || auth.pass !== this.credentials.pass) {
            res.statusCode = 401;
            res.setHeader("WWW-Authenticate", 'Basic realm="Access to stats"');
            res.end("Access denied");
            return;
          }
        }
        const url = require("url").parse(req.url);

        if (url.pathname === "/ping") {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (url.pathname === "/ready") {
          res.statusCode = this.online ? 200 : 503;
          res.end();
          return;
        }

        if (url.pathname === "/version") {
          const body = JSON.stringify({ version });
          res.writeHead(200, {
            "Content-Length": Buffer.byteLength(body),
            "Content-Type": "application/json"
          });
          res.end(body);
          return;
        }

        const proxyStats = this.getStats();
        let body = JSON.stringify({
          code: 404,
          error: "Not Found"
        });

        if (url.pathname === "/stats") {
          body = JSON.stringify(
            {
              miners: proxyStats.miners.length,
              connections: proxyStats.connections.length
            },
            null,
            2
          );
        }

        if (url.pathname === "/miners") {
          body = JSON.stringify(proxyStats.miners, null, 2);
        }

        if (url.pathname === "/connections") {
          body = JSON.stringify(proxyStats.connections, null, 2);
        }

        res.writeHead(200, {
          "Content-Length": Buffer.byteLength(body),
          "Content-Type": "application/json"
        });
        res.end(body);
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
      miner.on("open", (data: OpenEvent) => this.emit("open", data));
      miner.on("authed", (data: AuthedEvent) => this.emit("authed", data));
      miner.on("job", (data: JobEvent) => this.emit("job", data));
      miner.on("found", (data: FoundEvent) => this.emit("found", data));
      miner.on("accepted", (data: AcceptedEvent) => this.emit("accepted", data));
      miner.on("close", (data: CloseEvent) => this.emit("close", data));
      miner.on("error", (data: ErrorEvent) => this.emit("error", data));
      miner.connect();
    });
    if (!host && !callback) {
      this.server.listen(port);
    } else if (!host && callback) {
      this.server.listen(port, callback);
    } else if (host && !callback) {
      this.server.listen(port, host);
    } else {
      this.server.listen(port, host, callback);
    }
    this.wss.on("listening", () => {
      this.online = true;
      console.log(`listening on port ${port}` + (isHTTPS ? ", using a secure connection" : ""));
      console.log(`miners per connection:`, this.maxMinersPerConnection);
      if (wssOptions.path) {
        console.log(`path: ${wssOptions.path}`);
      }
      if (!this.dynamicPool) {
        console.log(`host: ${this.host}`);
        console.log(`port: ${this.port}`);
        console.log(`pass: ${this.pass}`);
      }
    });
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
    return availableConnections.pop();
  }

  isAvailable(connection: Connection): boolean {
    return (
      connection.miners.length < this.maxMinersPerConnection &&
      connection.donations.length < this.maxMinersPerConnection
    );
  }

  isEmpty(connection: Connection): boolean {
    return connection.miners.length === 0 && connection.donations.length === 0;
  }

  getStats(): Stats {
    return Object.keys(this.connections).reduce(
      (stats, key) => ({
        miners: [
          ...stats.miners,
          ...this.connections[key].reduce(
            (miners, connection) => [
              ...miners,
              ...connection.miners.map(miner => ({
                id: miner.id,
                login: miner.login,
                hashes: miner.hashes
              }))
            ],
            []
          )
        ],
        connections: [
          ...stats.connections,
          ...this.connections[key].filter(connection => !connection.donation).map(connection => ({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            miners: connection.miners.length
          }))
        ]
      }),
      {
        miners: [],
        connections: []
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
    this.online = false;
    console.log(`💀`);
  }
}

export default Proxy;
