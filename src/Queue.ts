import * as EventEmitter from "events";
import { QueueMessage } from "./types";

class Queue extends EventEmitter {
  events: QueueMessage[] = [];
  interval: NodeJS.Timer = null;
  bypassed: boolean = false;
  ms: number = 100;

  constructor(ms: number = 100) {
    super();
    this.ms = ms;
  }

  start(): void {
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

  stop(): void {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  bypass(): void {
    this.bypassed = true;
    this.stop();
  }

  push(event: QueueMessage): void {
    if (this.bypassed) {
      this.emit(event.type, event.payload);
    } else {
      this.events.push(event);
    }
  }
}

export default Queue;
