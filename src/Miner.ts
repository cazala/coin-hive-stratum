import * as EventEmitter from "events";
import * as WebSocket from "ws";
import * as uuid from "uuid";
import Connection from "./Connection";
import Donation from "./Donation";
import Queue from "./Queue";
import { minersCounter, sharesCounter, sharesMeter } from "./Metrics";
import {
  Job,
  CoinHiveError,
  CoinHiveResponse,
  CoinHiveLoginParams,
  CoinHiveRequest,
  StratumRequest,
  StratumRequestParams,
  StratumError,
  StratumJob
} from "./types";

export type Options = {
  connection: Connection | null;
  ws: WebSocket | null;
  address: string | null;
  user: string | null;
  diff: number | null;
  pass: string | null;
  donations: Donation[] | null;
};

class Miner extends EventEmitter {
  id: string = uuid.v4();
  login: string = null;
  address: string = null;
  user: string = null;
  diff: number = null;
  pass: string = null;
  donations: Donation[] = null;
  heartbeat: NodeJS.Timer = null;
  connection: Connection = null;
  queue: Queue = new Queue();
  ws: WebSocket = null;
  online: boolean = false;
  jobs: Job[] = [];
  hashes: number = 0;

  constructor(options: Options) {
    super();
    this.connection = options.connection;
    this.ws = options.ws;
    this.address = options.address;
    this.user = options.user;
    this.diff = options.diff;
    this.pass = options.pass;
    this.donations = options.donations;
  }

  async connect() {
    console.log(`miner connected (${this.id})`);
    minersCounter.inc();
    this.donations.forEach(donation => donation.connect());
    this.ws.on("message", this.handleMessage.bind(this));
    this.ws.on("close", () => {
      if (this.online) {
        console.log(`miner connection closed (${this.id})`);
        this.kill();
      }
    });
    this.ws.on("error", error => {
      if (this.online) {
        console.log(`miner connection error (${this.id}):`, error.message);
        this.kill();
      }
    });
    this.connection.addMiner(this);
    this.connection.on(this.id + ":authed", this.handleAuthed.bind(this));
    this.connection.on(this.id + ":job", this.handleJob.bind(this));
    this.connection.on(this.id + ":accepted", this.handleAccepted.bind(this));
    this.connection.on(this.id + ":error", this.handleError.bind(this));
    this.queue.on("message", (message: StratumRequest) =>
      this.connection.send(this.id, message.method, message.params)
    );
    this.heartbeat = setInterval(() => this.connection.send(this.id, "keepalived"), 30000);
    this.online = true;
    await Promise.all(this.donations.map(donation => donation.ready));
    if (this.online) {
      this.queue.start();
      console.log(`miner started (${this.id})`);
      this.emit("open", {
        id: this.id
      });
    }
  }

  kill() {
    this.queue.stop();
    this.connection.removeMiner(this.id);
    this.connection.removeAllListeners(this.id + ":authed");
    this.connection.removeAllListeners(this.id + ":job");
    this.connection.removeAllListeners(this.id + ":accepted");
    this.connection.removeAllListeners(this.id + ":error");
    this.donations.forEach(donation => donation.kill());
    this.jobs = [];
    this.donations = [];
    this.hashes = 0;
    this.ws.close();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.online) {
      this.online = false;
      minersCounter.dec();
      console.log(`miner disconnected (${this.id})`);
      this.emit("close", {
        id: this.id,
        login: this.login
      });
    }
    this.removeAllListeners();
  }

  sendToMiner(payload: CoinHiveResponse) {
    const coinhiveMessage = JSON.stringify(payload);
    if (this.online && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(coinhiveMessage);
      } catch (e) {
        this.kill();
      }
    }
  }

  sendToPool(method: string, params: StratumRequestParams) {
    this.queue.push({
      type: "message",
      payload: {
        method,
        params
      }
    });
  }

  handleAuthed(auth: string): void {
    console.log(`miner authenticated (${this.id}):`, auth);
    this.sendToMiner({
      type: "authed",
      params: {
        token: "",
        hashes: 0
      }
    });
    this.emit("authed", {
      id: this.id,
      login: this.login,
      auth
    });
  }

  handleJob(job: Job): void {
    console.log(`job arrived (${this.id}):`, job.job_id);
    this.jobs.push(job);
    const donations = this.donations.filter(donation => donation.shouldDonateJob());
    donations.forEach(donation => {
      this.sendToMiner({
        type: "job",
        params: donation.getJob()
      });
    });
    if (!this.hasPendingDonations() && donations.length === 0) {
      this.sendToMiner({
        type: "job",
        params: this.jobs.pop()
      });
    }
    this.emit("job", {
      id: this.id,
      login: this.login,
      job
    });
  }

  handleAccepted(job: StratumJob): void {
    this.hashes++;
    console.log(`shares accepted (${this.id}):`, this.hashes);
    sharesCounter.inc();
    sharesMeter.mark();
    this.sendToMiner({
      type: "hash_accepted",
      params: {
        hashes: this.hashes
      }
    });
    this.emit("accepted", {
      id: this.id,
      login: this.login,
      hashes: this.hashes
    });
  }

  handleError(error: StratumError): void {
    console.warn(
      `pool connection error (${this.id}):`,
      error.error || (error && JSON.stringify(error)) || "unknown error"
    );
    if (this.online) {
      if (error.error === "invalid_site_key") {
        this.sendToMiner({
          type: "error",
          params: error
        });
      }
      this.emit("error", {
        id: this.id,
        login: this.login,
        error
      });
    }
    this.kill();
  }

  handleMessage(message: string) {
    let data: CoinHiveRequest;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.warn(`can't parse message as JSON from miner:`, message, e.message);
      return;
    }
    switch (data.type) {
      case "auth": {
        const params = data.params as CoinHiveLoginParams;
        this.login = this.address || params.site_key;
        const user = this.user || params.user;
        if (user) {
          this.login += "." + user;
        }
        if (this.diff) {
          this.login += "+" + this.diff;
        }
        this.sendToPool("login", {
          login: this.login,
          pass: this.pass
        });
        break;
      }

      case "submit": {
        const job = data.params as Job;
        console.log(`job submitted (${this.id}):`, job.job_id);
        if (!this.isDonation(job)) {
          this.sendToPool("submit", job);
        } else {
          const donation = this.getDonation(job);
          donation.submit(job);
          this.sendToMiner({
            type: "hash_accepted",
            params: {
              hashes: ++this.hashes
            }
          });
        }
        this.emit("found", {
          id: this.id,
          login: this.login,
          job
        });
        break;
      }
    }
  }

  isDonation(job: Job): boolean {
    return this.donations.some(donation => donation.hasJob(job));
  }

  getDonation(job: Job): Donation {
    return this.donations.find(donation => donation.hasJob(job));
  }

  hasPendingDonations(): boolean {
    return this.donations.some(donation => donation.taken.filter(job => !job.done).length > 0);
  }
}

export default Miner;
