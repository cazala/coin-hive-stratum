const EventEmitter = require("events");
module.exports = class Queue extends EventEmitter {
  constructor(ms = 100) {
    super();
    this.events = [];
    this.interval = null;
    this.ms = ms;
    this.baypassed = false;
  }

  start() {
    if (this.interval == null) {
      const that = this;
      this.interval = setInterval(() => {
        const event = that.events.pop();
        if (event) {
          that.emit(event.type, event.payload);
        } else {
          this.bypass();
        }
      }, this.ms);
    }
  }

  stop() {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  bypass() {
    this.bypassed = true;
    this.stop();
  }

  push(event) {
    if (this.bypassed) {
      this.emit(event.type, event.payload);
    } else {
      this.events.push(event);
    }
  }
};
