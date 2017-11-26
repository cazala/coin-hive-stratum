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
  StratumRequestParams
} from "src/types";

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
      console.log(`miner connection closed (${this.id})`);
      this.kill();
    });
    this.ws.on("error", error => {
      console.log(`miner connection error (${this.id}):`, error);
      this.kill();
    });
    this.connection.add(this);
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
    }
  }

  kill() {
    this.queue.stop();
    this.connection.remove(this.id);
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
    this.online = false;
    minersCounter.dec();
    console.log(`miner disconnected (${this.id})`);
  }

  sendToMiner(payload: CoinHiveResponse) {
    const coinhiveMessage = JSON.stringify(payload);
    if (this.online) {
      try {
        this.ws.send(coinhiveMessage);
      } catch (e) {
        console.warn(`failed to send message to miner, websocket seems to be already closed`, e.message);
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
  }

  handleJob(job: Job): void {
    console.log(`job arrived (${this.id}):`, job.job_id);
    this.jobs.push(job);
    this.sendToMiner({
      type: "job",
      params: this.getJob()
    });
  }

  handleAccepted(): void {
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
  }

  handleError(error: CoinHiveError): void {
    console.warn(`pool connection error (${this.id}):`, error);
    this.sendToMiner({
      type: "error",
      params: error
    });
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
        let login = this.address || params.site_key;
        const user = this.user || params.user;
        if (user) {
          login += "." + user;
        }
        if (this.diff) {
          login += "+" + this.diff;
        }
        this.sendToPool("login", {
          login: login,
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
        break;
      }
    }
  }

  getJob(): Job {
    const donation = this.donations.filter(donation => donation.shouldDonateJob()).pop();
    return donation ? donation.getJob() : this.jobs.pop();
  }

  isDonation(job: Job): boolean {
    return this.donations.some(donation => donation.hasJob(job));
  }

  getDonation(job: Job): Donation {
    return this.donations.find(donation => donation.hasJob(job));
  }
}

export default Miner;
