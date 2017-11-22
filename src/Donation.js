const uuid = require("uuid");

class Donation {
  constructor(donation, connection) {
    this.id = uuid.v4();
    this.online = false;
    this.address = donation.address;
    this.host = donation.host;
    this.port = donation.port;
    this.pass = donation.pass;
    this.percentage = donation.percentage;
    this.connection = connection;
    this.jobs = [];
    this.taken = [];
    this.heartbeat = null;
  }

  connect() {
    let login = this.address;
    if (this.user) {
      login += "." + this.user;
    }
    this.connection.send(this.id, "login", {
      login: login,
      pass: this.pass
    });
    this.connection.on(this.id + ":job", this.handleJob.bind(this));
    this.connection.on(this.id + ":accepted", () => console.log("$$$"));
    this.heartbeat = setInterval(() => this.connection.send(this.id, "keepalived"), 30000);
    this.online = true;
  }

  kill() {
    this.connection.clear(this.id);
    this.connection.removeAllListeners(this.id + ":job");
    this.jobs = [];
    this.taken = [];
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.online = false;
  }

  submit(job) {
    this.connection.send(this.id, "submit", job);
    console.log("new donation job submitted");
  }

  handleJob(job) {
    console.log("new donation job arrived");
    this.jobs.push(job);
  }

  getJob() {
    const job = this.jobs.pop();
    console.log("new donation job taken");
    this.taken.push(job);
    return job;
  }

  shouldDonateJob() {
    const chances = Math.random();
    const shouldDonateJob = this.jobs.length > 0 && chances < 0.99; //this.percentage;
    console.log("donation chances", chances, shouldDonateJob ? "should donate" : "should not donate");
    return shouldDonateJob;
  }

  hasJob(job) {
    return this.taken.some(j => j.job_id === job.job_id);
  }
}

module.exports = Donation;
