const WebSocket = require('ws');
const Queue = require('./queue');
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
      wss.on('connection', (ws) => {
        let getRpcId = null;
        let getHashes = null;
        let sendToPool = null;
        let online = null;
        let workerId = null;
        let rpcId = null;
        let hashes = null;
        let socket = null;
        log('new websocket connection');
        let queue = new Queue();
        log('queue created');
        ws.on('message', function (message) {
          queue.push({
            type: 'message',
            payload: message
          });
        });
        ws.on('close', () => {
          queue.push({
            type: 'close',
            payload: null
          });
        });
        ws.on('error', (error) => {
          queue.push({
            type: 'error',
            payload: error
          });
        });
        queue.on('close', () => {
          online = false;
          if (socket) {
            queue.stop();
            socket.destroy();
          }
          log('miner connection closed');
        });
        queue.on('error', (error) => {
          if (socket) {
            queue.stop();
            socket.destroy();
          }
          log('miner connection error', error.message);
        });
        queue.on('message', function (message) {
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
                params: {
                  id: workerId,
                  job_id: data.params.job_id,
                  nonce: data.params.nonce,
                  result: data.params.result
                }
              });
              break;
            }
          }
        })
        socket = new net.Socket();
        log('tcp socket created');
        socket.connect(+constructorOptions.port, constructorOptions.host, function () {
          log('connected to pool');
          log('host', constructorOptions.host);
          log('port', constructorOptions.port);
          online = true;
          workerId = null;
          rpcId = 1;
          hashes = 1;
          getRpcId = () => rpcId++;
          getHashes = () => (hashes++);
          sendToPool = (payload) => {
            const stratumMessage = JSON.stringify(payload) + '\n';
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
          socket.on('close', function () {
            log('connection to pool closed');
            ws.close();
            queue.stop();
          });
          socket.on('error', function (error) {
            log('pool connection error', error && error.message ? error.message : error);
            ws.close();
            queue.stop();
          });
          queue.start();
          log('queue started');
        });
      })
    }
  }
}

module.exports = createProxy;