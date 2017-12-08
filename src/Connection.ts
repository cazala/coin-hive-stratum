import * as EventEmitter from "events";
import * as net from "net";
import * as tls from "tls";
import * as uuid from "uuid";
import Donation from "./Donation";
import Miner from "./Miner";
import Queue from "./Queue";
import { connectionsCounter } from "./Metrics";
import {
  Dictionary,
  Socket,
  StratumRequestParams,
  StratumResponse,
  StratumRequest,
  StratumJob,
  StratumLoginResult,
  RPCMessage,
  StratumKeepAlive,
  Job
} from "./types";

export type Options = {
  host: string;
  port: number;
  ssl: boolean;
  donation: boolean;
};

class Connection extends EventEmitter {
  id: string = uuid.v4();
  host: string = null;
  port: number = null;
  ssl: boolean = null;
  online: boolean = null;
  socket: Socket = null;
  queue: Queue = null;
  buffer: string = "";
  rpcId: number = 1;
  rpc: Dictionary<RPCMessage> = {};
  auth: Dictionary<string> = {};
  minerId: Dictionary<string> = {};
  miners: Miner[] = [];
  donations: Donation[] = [];
  donation: boolean;

  constructor(options: Options) {
    super();
    this.host = options.host;
    this.port = options.port;
    this.ssl = options.ssl;
    this.donation = options.donation;
  }

  connect() {
    if (this.online) {
      this.kill();
    }
    this.queue = new Queue();
    if (this.ssl) {
      this.socket = tls.connect(+this.port, this.host, { rejectUnauthorized: false });
    } else {
      this.socket = net.connect(+this.port, this.host);
    }
    this.socket.on("connect", this.ready.bind(this));
    this.socket.on("error", error => {
      if (this.online) {
        console.warn(`socket error (${this.host}:${this.port})`, error.message);
        this.emit("error", error);
        this.connect();
      }
    });
    this.socket.on("close", () => {
      if (this.online) {
        console.log(`socket closed (${this.host}:${this.port})`);
        this.emit("close");
      }
    });
    this.socket.setKeepAlive(true);
    this.socket.setEncoding("utf8");
    this.online = true;
    if (!this.donation) {
      connectionsCounter.inc();
    }
  }

  kill() {
    if (this.socket != null) {
      try {
        this.socket.end();
        this.socket.destroy();
      } catch (e) {
        console.warn(`something went wrong while destroying socket (${this.host}:${this.port}):`, e.message);
      }
    }
    if (this.queue != null) {
      this.queue.stop();
    }
    if (this.online) {
      this.online = false;
      if (!this.donation) {
        connectionsCounter.dec();
      }
    }
  }

  ready() {
    // message from pool
    this.socket.on("data", chunk => {
      this.buffer += chunk;
      while (this.buffer.includes("\n")) {
        const newLineIndex = this.buffer.indexOf("\n");
        const stratumMessage = this.buffer.slice(0, newLineIndex);
        this.buffer = this.buffer.slice(newLineIndex + 1);
        this.receive(stratumMessage);
      }
    });
    // message from miner
    this.queue.on("message", (message: StratumRequest) => {
      if (!this.online) {
        return false;
      }
      if (!this.socket.writable) {
        if (message.method === "keepalived") {
          return false;
        }
        const retry = message.retry ? message.retry * 2 : 1;
        const ms = retry * 100;
        message.retry = retry;
        setTimeout(() => {
          this.queue.push({
            type: "message",
            payload: message
          });
        }, ms);
        return false;
      }
      try {
        if (message.retry) {
          delete message.retry;
        }
        this.socket.write(JSON.stringify(message) + "\n");
      } catch (e) {
        console.warn(`failed to send message to pool (${this.host}:${this.port}): ${JSON.stringify(message)}`);
      }
    });
    // kick it
    this.queue.start();
    this.emit("ready");
  }

  receive(message: string) {
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return console.warn(`invalid stratum message:`, message);
    }
    // it's a response
    if (data.id) {
      const response = data as StratumResponse;
      if (!this.rpc[response.id]) {
        // miner is not online anymore
        return;
      }
      const minerId = this.rpc[response.id].minerId;
      const method = this.rpc[response.id].message.method;
      switch (method) {
        case "login": {
          if (response.error && response.error.code === -1) {
            this.emit(minerId + ":error", {
              error: "invalid_site_key"
            });
            return;
          }
          const result = response.result as StratumLoginResult;
          const auth = result.id;
          this.auth[minerId] = auth;
          this.minerId[auth] = minerId;
          this.emit(minerId + ":authed", auth);
          if (result.job) {
            this.emit(minerId + ":job", result.job);
          }
          break;
        }
        case "submit": {
          const job = this.rpc[response.id].message.params as StratumJob;
          if (response.result && response.result.status === "OK") {
            this.emit(minerId + ":accepted", job);
          } else if (response.error) {
            this.emit(minerId + ":error", response.error);
          }
          break;
        }
        default: {
          if (response.error && response.error.code === -1) {
            this.emit(minerId + ":error", response.error);
          }
        }
      }
      delete this.rpc[response.id];
    } else {
      // it's a request
      const request = data as StratumRequest;
      switch (request.method) {
        case "job": {
          const jobParams = request.params as StratumJob;
          const minerId = this.minerId[jobParams.id];
          if (!minerId) {
            // miner is not online anymore
            return;
          }
          this.emit(minerId + ":job", request.params);
          break;
        }
      }
    }
  }

  send(id: string, method: string, params: StratumRequestParams = {}) {
    let message: StratumRequest = {
      id: this.rpcId++,
      method,
      params
    };

    switch (method) {
      case "login": {
        // ..
        break;
      }
      case "keepalived": {
        if (this.auth[id]) {
          const keepAliveParams = message.params as StratumKeepAlive;
          keepAliveParams.id = this.auth[id];
        } else {
          return false;
        }
      }
      case "submit": {
        if (this.auth[id]) {
          const submitParams = message.params as StratumJob;
          submitParams.id = this.auth[id];
        } else {
          return false;
        }
      }
    }

    this.rpc[message.id] = {
      minerId: id,
      message
    };

    this.queue.push({
      type: "message",
      payload: message
    });
  }

  addMiner(miner: Miner): void {
    if (this.miners.indexOf(miner) === -1) {
      this.miners.push(miner);
    }
  }

  removeMiner(minerId: string): void {
    const miner = this.miners.find(x => x.id === minerId);
    if (miner) {
      this.miners = this.miners.filter(x => x.id !== minerId);
      this.clear(miner.id);
    }
  }

  addDonation(donation: Donation): void {
    if (this.donations.indexOf(donation) === -1) {
      this.donations.push(donation);
    }
  }

  removeDonation(donationId: string): void {
    const donation = this.donations.find(x => x.id === donationId);
    if (donation) {
      this.donations = this.donations.filter(x => x.id !== donationId);
      this.clear(donation.id);
    }
  }

  clear(id: string): void {
    const auth = this.auth[id];
    delete this.auth[id];
    delete this.minerId[auth];
    Object.keys(this.rpc).forEach(key => {
      if (this.rpc[key].minerId === id) {
        delete this.rpc[key];
      }
    });
  }
}

export default Connection;
