import * as pmx from "pmx";
const probe = pmx.probe();

export const minersCounter = probe.counter({
  name: "Miners"
});

export const connectionsCounter = probe.counter({
  name: "Connections"
});

export const sharesCounter = probe.counter({
  name: "Shares"
});

export const sharesMeter = probe.meter({
  name: "Shares per minute",
  samples: 60
});
