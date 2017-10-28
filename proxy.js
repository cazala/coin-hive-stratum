const https = require('https');
const fs = require('fs');

const httpServer = https.createServer({
  cert:fs.readFileSync('/etc/letsencrypt/live/xmr01.proxy.tocryptochain.com/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/xmr01.proxy.tocryptochain.com/privkey.pem')
});

const createProxy = require('./');

const proxy = createProxy({
  host: 'xmr.pool.cryptochain.com',
  port: 3333
});
proxy.listen({
  port: process.env.PORT,
  server: httpServer
});