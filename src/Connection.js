const EventEmitter = require("events");
const uuid = require("uuid");
const net = require("net");
const tls = require("tls");
const Queue = require("./Queue");

class Connection extends EventEmitter {
  constructor({ host, port, ssl }) {
    super();
    this.id = uuid.v4();
    this.online = false;
    this.host = host;
    this.port = port;
    this.ssl = ssl;
    this.socket = null;
    this.queue = null;
    this.buffer = "";
    this.rpcId = 1;
    this.rpc = {};
    this.auth = {};
    this.minerId = {};
    this.miners = [];
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
      console.warn(`socket error (${this.host}:${this.port})`, error.message);
      this.emit("error", error);
      this.connect();
    });
    this.socket.on("close", () => {
      console.warn(`socket closed (${this.host}:${this.port})`);
      this.emit("close");
    });
    this.socket.setKeepAlive(true);
    this.socket.setEncoding("utf8");
    this.online = true;
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
    this.online = false;
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
        console.log("message from pool", stratumMessage);
      }
    });
    // message from miner
    this.queue.on("message", message => {
      if (!this.socket.writable) {
        console.warn(
          `couldn't send message to pool (${this.host}:${this.port}) because socket is not writable: ${message}`
        );
        return false;
      }
      try {
        console.log("message to pool", message);
        this.socket.write(message + "\n");
      } catch (e) {
        console.warn(`failed to send message to pool (${this.host}:${this.port}): ${message}`);
      }
    });
    // kick it
    this.queue.start();
    this.emit("ready");
  }

  receive(message) {
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return console.warn(`invalid stratum message:`, message);
    }
    // it's a reply
    if (data.id) {
      if (!this.rpc[data.id]) {
        console.warn(`dropping reply for a miner that is not online anymore`, message, this.rpc);
        return;
      }
      const minerId = this.rpc[data.id].minerId;
      const method = this.rpc[data.id].message.method;
      delete this.rpc[data.id];
      switch (method) {
        case "login": {
          if (data.error && data.error.code === -1) {
            this.emit(minerId + ":error", {
              error: "invalid_site_key"
            });
            console.warn(`invalid site key (${minerId})`);
            return;
          }
          const auth = data.result.id;
          this.auth[minerId] = auth;
          this.minerId[auth] = minerId;
          this.emit(minerId + ":authed", auth);
          if (data.result.job) {
            this.emit(minerId + ":job", data.result.job);
          }
          break;
        }
        case "submit": {
          if (data.result && data.result.status === "OK") {
            this.emit(minerId + ":accepted");
          }
          break;
        }
        default: {
          if (data.error && data.error.code === -1) {
            this.emit(minerId + ":error", data);
          }
        }
      }
    } else {
      // it's not a reply
      switch (data.method) {
        case "job": {
          const minerId = this.minerId[data.params.id];
          if (!minerId) {
            console.warn(`dropping job for a miner that is not online anymore`, message);
            return;
          }
          this.emit(minerId + ":job", data.params);
          break;
        }
      }
    }
  }

  send(id, method, params = {}) {
    let message = {
      id: this.rpcId++,
      method,
      params
    };
    if (this.auth[id]) {
      message.params.id = this.auth[id];
    } else {
      if (method !== "login") {
        console.error("invalid id", id, this.auth);
      }
    }
    this.rpc[message.id] = {
      minerId: id,
      message
    };
    this.queue.push({
      type: "message",
      payload: JSON.stringify(message)
    });
  }

  add(miner) {
    if (this.miners.indexOf(miner) === -1) {
      this.miners.push(miner);
    }
  }

  remove(minerId) {
    const miner = this.miners.find(x => x.id !== minerId);
    if (miner) {
      this.miners = this.miners.filter(x => x.id !== minerId);
      this.clear(miner.id);
    }
  }

  clear(minerId) {
    const auth = this.auth[minerId];
    delete this.auth[minerId];
    delete this.minerId[auth];
    Object.keys(this.rpc).forEach(key => {
      if (this.rpc[key].minerId === minerId) {
        delete this.rpc[key];
      }
    });
  }
}

module.exports = Connection;
