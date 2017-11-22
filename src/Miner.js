const uuid = require("uuid");

class Miner {
  constructor(options) {
    super();
    this.id = uuid.v4();
    this.online = false;
    this.jobs = [];
    this.hashes = 0;
    this.connection = options.connection;
    this.ws = options.ws;
    this.address = options.address;
    this.user = options.user;
    this.diff = options.diff;
    this.pass = options.pass;
    this.donations = options.donations;
    this.heartbeat = null;
  }

  connect() {
    this.donations.forEach(donation => donation.connect());
    this.ws.on("message", this.handleMessage.bind(this));
    this.ws.on("close", () => this.kill());
    this.ws.on("error", () => this.kill());
    this.connection.add(this);
    this.connection.on(this.id + ":authed", this.handleAuthed.bind(this));
    this.connection.on(this.id + ":job", this.handleJob.bind(this));
    this.connection.on(this.id + ":accepted", this.handleAccepted.bind(this));
    this.connection.on(this.id + ":error", this.handleError.bind(this));
    this.heartbeat = setInterval(() => this.connection.send(this.id, "keepalived"), 30000);
    this.online = true;
    console.log(`miner connected (${this.id})`);
  }

  kill() {
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
    console.log(`miner disconnected (${this.id})`);
  }

  send(payload) {
    const coinhiveMessage = JSON.stringify(payload);
    if (this.online) {
      try {
        this.ws.send(coinhiveMessage);
        console.log(`message sent to miner (${this.id}):`, coinhiveMessage);
      } catch (e) {
        console.warn("websocket seems to be already closed", e.message);
        this.kill();
      }
    }
  }

  handleAuthed(auth) {
    console.log(`miner authenticated (${this.id}):`, auth);
    this.send({
      type: "authed",
      params: {
        token: "",
        hashes: 0
      }
    });
  }

  handleJob(job) {
    console.log(`new job arrived (${this.id}):`, job);
    this.jobs.push(job);
    this.send({
      type: "job",
      params: this.getJob()
    });
  }

  handleAccepted() {
    this.hashes++;
    console.log(`shares accepted (${this.id}):`, this.hashes);
    this.send({
      type: "hash_accepted",
      params: {
        hashes: this.hashes
      }
    });
  }

  handleError(error) {
    console.warn(`an error occurred (${this.id}):`, error);
    this.send({
      type: "error",
      params: error
    });
  }

  handleMessage(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.warn(`can't parse message as JSON from miner:`, message, e.message);
      return;
    }
    switch (data.type) {
      case "auth": {
        let login = this.address || data.params.site_key;
        const user = this.user || data.params.user;
        if (user) {
          login += "." + user;
        }
        if (this.diff) {
          login += "+" + this.diff;
        }
        this.connection.send(this.id, "login", {
          login: login,
          pass: this.pass
        });
        break;
      }

      case "submit": {
        const job = data.params;
        if (!this.isDonation(job)) {
          console.log(`job submitted (${this.id}):`, job);
          this.connection.send(this.id, "submit", job);
        } else {
          const donation = this.getDonation(job);
          donation.submit(job);
          this.send({
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

  getJob() {
    const donation = this.donations.filter(donation => donation.shouldDonateJob()).pop();
    return donation ? donation.getJob() : this.jobs.pop();
  }

  isDonation(job) {
    return this.donations.some(donation => donation.hasJob(job));
  }

  getDonation(job) {
    return this.donations.find(donation => donation.hasJob(job));
  }
}

module.exports = Miner;
