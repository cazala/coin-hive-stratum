import * as uuid from "uuid";
import Connection from "./Connection";
import { Job } from "src/types";

export type Options = {
  address: string;
  host: string;
  port: number;
  pass: string;
  percentage: number;
  connection: Connection;
};

class Donation {
  id: string = uuid.v4();
  address: string = null;
  host: string = null;
  port: number = null;
  user: string = null;
  pass: string = null;
  percentage: number = null;
  connection: Connection = null;
  online: boolean = false;
  jobs: Job[] = [];
  taken: Job[] = [];
  heartbeat: NodeJS.Timer = null;
  ready: Promise<void> = null;
  resolver: () => void = null;
  resolved: boolean = false;

  constructor(options: Options) {
    this.address = options.address;
    this.host = options.host;
    this.port = options.port;
    this.pass = options.pass;
    this.percentage = options.percentage;
    this.connection = options.connection;
    this.ready = new Promise(resolve => {
      this.resolved = false;
      this.resolver = resolve;
    });
  }

  connect(): void {
    let login = this.address;
    if (this.user) {
      login += "." + this.user;
    }
    this.connection.send(this.id, "login", {
      login: login,
      pass: this.pass
    });
    this.connection.on(this.id + ":job", this.handleJob.bind(this));
    this.heartbeat = setInterval(() => this.connection.send(this.id, "keepalived"), 30000);
    this.online = true;
    setTimeout(() => {
      if (!this.resolved) {
        this.resolved = true;
        this.resolver();
      }
    }, 5000);
  }

  kill(): void {
    this.connection.clear(this.id);
    this.connection.removeAllListeners(this.id + ":job");
    this.jobs = [];
    this.taken = [];
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.online = false;
    this.resolved = false;
  }

  submit(job: Job): void {
    this.connection.send(this.id, "submit", job);
  }

  handleJob(job: Job): void {
    this.jobs.push(job);
    if (!this.resolved) {
      this.resolver();
      this.resolved = true;
    }
  }

  getJob(): Job {
    const job = this.jobs.pop();
    this.taken.push(job);
    return job;
  }

  shouldDonateJob(): boolean {
    const chances = Math.random();
    const shouldDonateJob = this.jobs.length > 0 && chances < this.percentage;
    return shouldDonateJob;
  }

  hasJob(job: Job): boolean {
    return this.taken.some(j => j.job_id === job.job_id);
  }
}

export default Donation;
