const Proxy = require("./build");
const proxy = new Proxy({
  dynamicPool: true
});
proxy.listen(8892);
