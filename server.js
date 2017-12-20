const Proxy = require("./build");
const proxy = new Proxy({
  dynamicPool: true
});
proxy.listen(process.env.PORT || 8892);
