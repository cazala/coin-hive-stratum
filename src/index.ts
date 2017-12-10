import Proxy from "./Proxy";
export = Proxy;

process.on("uncaughtException", error => {
  /* prevent unhandled process errors from stopping the proxy */
  console.error("process error:", error.message);
});
