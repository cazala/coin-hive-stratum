const WebSocket = require('ws');
const net = require('net');
const defaults = require('../config/defaults');
function createProxy(options = defaults) {
  const constructorOptions = Object.assign({}, defaults, options);
  const log = function () { options.log && console.log.apply(null, arguments) };
  return {
    listen: function listen(port = 8892) {
      let wss = new WebSocket.Server({ port: +port });
      log('websocket server created');
      log('listening on port', port);
      let socket = new net.Socket();
      log('tcp socket created');
      socket.connect(+constructorOptions.port, constructorOptions.host, function () {
        log('connected to pool');
        log('host', constructorOptions.host);
        log('port', constructorOptions.port);
        wss.on('connection', (ws) => {
          let online = true;
          let workerId = null;
          let rpcId = 1;
          let hashes = 1;
          let getRpcId = () => rpcId++;
          let getHashes = () => (hashes++);
          let sendToPool = (payload) => {
            const stratumMessage = JSON.stringify(payload);
            socket.write(stratumMessage);
            log('\nmessage sent to pool:\n\n', stratumMessage);
          }
          let sendToMiner = (payload) => {
            const coinHiveMessage = JSON.stringify(payload);
            if (online) {
              ws.send(coinHiveMessage);
              log('\nmessage sent to miner:\n\n', coinHiveMessage);
            } else {
              log('\nfailed to send message to miner cos it was offline:', coinHiveMessage)
            }
          }
          log('new websocket connection');
          ws.on('message', function (message) {
            log('\nmessage from miner to pool:\n\n', message);
            const data = JSON.parse(message);
            switch (data.type) {
              case 'auth': {
                let login = data.params.site_key;
                if (data.params.user) {
                  login += '.' + data.params.user;
                }
                sendToPool({
                  id: getRpcId(),
                  method: 'login',
                  params: {
                    login: login,
                    pass: 'x'
                  },
                });
                break;
              }
              case 'submit': {
                sendToPool({
                  id: getRpcId(),
                  method: 'submit',
                  params: data.params
                });
                break;
              }
            }
          });
          socket.on('data', function (buffer) {
            const stratumMessage = buffer.toString('utf8');
            log('\nmessage from pool to miner:\n\n', stratumMessage);
            const data = JSON.parse(stratumMessage);
            if (data.id === 1) {
              workerId = data.result.id;
              sendToMiner({
                type: 'authed',
                params: {
                  token: '',
                  hashes: 0
                }
              });
              if (data.result.job) {
                sendToMiner({
                  type: 'job',
                  params: data.result.job
                });
              }
            } else {
              if (data.method === 'job') {
                sendToMiner({
                  type: 'job',
                  params: data.params
                });
              }
              if (data.result && data.result.status === 'OK') {
                sendToMiner({
                  type: 'hash_accepted',
                  params: {
                    hashes: getHashes()
                  }
                });
              }
            }
          });
          ws.on('close', () => {
            online = false;
          });
          ws.on('error', (error) => {
            log('miner connection error', error);
          });
          socket.on('close', function () {
            log('connection to pool closed');
            ws.close();
          });
          socket.on('error', function (error) {
            log('pool connection error', error);
          });
        });
      })
    }
  }
}

module.exports = createProxy;