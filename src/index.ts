import Proxy from "./Proxy";
module.exports = Proxy;

process.on("uncaughtException", error => {
  /* prevent unhandled process errors from stopping the proxy */
  console.error("process error:", error.message);
});
