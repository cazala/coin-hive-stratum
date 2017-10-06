const EventEmitter = require('events');
module.exports = class Queue extends EventEmitter {

  constructor(ms = 1000) {
    super();
    this.events = [];
    this.interval = null;
    this.ms = ms;
  }

  start() {
    if (this.interval == null) {
      const that = this;
      this.interval = setInterval(() => {
        const event = that.events.pop();
        if (event) {
          that.emit(event.type, event.payload);
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

  push(event) {
    this.events.push(event);
  }
}