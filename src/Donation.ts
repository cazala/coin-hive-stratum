import * as uuid from "uuid";
import Connection from "./Connection";
import { Job, StratumError, StratumJob, TakenJob } from "./types";

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
  taken: TakenJob[] = [];
  heartbeat: NodeJS.Timer = null;
  ready: Promise<void> = null;
  resolver: () => void = null;
  resolved: boolean = false;
  shouldDonateNextTime: boolean = false;

  constructor(options: Options) {
    this.address = options.address;
    this.host = options.host;
    this.port = options.port;
    this.pass = options.pass;
    this.percentage = options.percentage;
    this.connection = options.connection;
  }

  connect(): void {
    if (this.online) {
      this.kill();
    }
    this.ready = new Promise(resolve => {
      this.resolved = false;
      this.resolver = resolve;
    });
    let login = this.address;
    if (this.user) {
      login += "." + this.user;
    }
    this.connection.addDonation(this);
    this.connection.send(this.id, "login", {
      login: login,
      pass: this.pass
    });
    this.connection.on(this.id + ":job", this.handleJob.bind(this));
    this.connection.on(this.id + ":error", this.handleError.bind(this));
    this.connection.on(this.id + ":accepted", this.handleAccepted.bind(this));
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
    this.connection.removeDonation(this.id);
    this.connection.removeAllListeners(this.id + ":job");
    this.connection.removeAllListeners(this.id + ":error");
    this.connection.removeAllListeners(this.id + ":accepted");
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
    this.taken.push({
      ...job,
      done: false
    });
    return job;
  }

  shouldDonateJob(): boolean {
    const chances = Math.random();
    const shouldDonateJob = chances <= this.percentage || this.shouldDonateNextTime;
    if (shouldDonateJob && this.jobs.length === 0) {
      this.shouldDonateNextTime = true;
      return false;
    }
    this.shouldDonateNextTime = false;
    return shouldDonateJob;
  }

  hasJob(job: Job): boolean {
    return this.taken.some(j => j.job_id === job.job_id);
  }

  handleAccepted(job: StratumJob) {
    const finishedJob = this.taken.find(j => j.job_id === job.job_id);
    if (finishedJob) {
      finishedJob.done = true;
    }
  }

  handleError(error: StratumError) {
    this.connect();
  }
}

export default Donation;
