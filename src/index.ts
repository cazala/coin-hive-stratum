import Proxy from "./Proxy";
module.exports = Proxy;

process.on("uncaughtException", err => {
  console.error("Error:", err.message);
});
