CoinHive Stratum Proxy
----------------------

This proxy allows you to use CoinHive's JavaScript miner on a custom stratum pool. This package was inspired by x25's [coinhive-stratum-mining-proxy](https://github.com/x25/coinhive-stratum-mining-proxy).

## Installation

```
npm install -g coin-hive-stratum
```

## Usage

You just need to launch a proxy pointing to the desired pool:

```
coin-hive-stratum 8892 --host=la01.supportxmr.com --port=3333
```

And then just point your CoinHive miner to the proxy:

```html
<script src="https://coinhive.com/lib/coinhive.min.js"></script>
<script>
  // Configure CoinHive to point to your proxy
  CoinHive.CONFIG.WEBSOCKET_SHARDS = [["ws://localhost:8892"]];

  // Start miner
  var miner = CoinHive.Anonymous('your-monero-address');
  miner.start();

</script>
```

Now your CoinHive miner would be mining on `supportXMR.com` pool, using your monero address. This will work for any pool based on the [Stratum Mining Protocol](https://en.bitcoin.it/wiki/Stratum_mining_protocol). You can even set up [your own](https://github.com/zone117x/node-stratum-pool).


## CLI

```
Usage: 'coin-hive-stratum <port>'

<port>: The port where the server will listen to

Options:

  --host          The pool's host.
  --port          The pool's port.
  --pass          The pool's password, by default it's "x".
  --tls           Use TLS to connect to the pool.
  --login         A fixed wallet for all the miners.
  --user          A fixed user for all the miners.
  --diff          A fixed difficulty for all the miner. This is not supported by all the pools.
  --log           Enable/Disable the logs, default is true
  --log-file      A filename where the logs will be stored, ie: proxy.log
  --stats-file    A filename where the stats will be stored, ie: proxy.stats
  --dynamic-pool  If true, the pool can be set dynamically by sending a ?pool=host:port:pass query param to the websocket endpoint
```

## API

- `createProxy`: Creates a `proxy` server. It may take an `options` object with the following optional properties:

  - `host`: the pool's host.

  - `port`: the pool's port.

  - `pass`: the pool's password, default is `"x"`.

  - `tls`: use TLS to connect to the pool.

  - `login`: a fixed wallet for all the miners.
  
  - `user`: a fixed user for all the miners.

  - `diff`: a fixed difficulty for all the miners.

  - `log`: enable/disable the logs, default is `true`.

  - `logFile`: a filename where the logs will be stored, ie: `"proxy.log"`.

  - `statsFile`: a filename where the stats will be stored, ie: `"proxy.stats"`

  - `dynamicPool`: if true, the pool can be set dynamically by sending a `?pool=host:port:pass` query param to the websocket endpoint.

- `proxy.listen(port|wssOptions)`: launches the server listening on the specified port, which by default is `8892`. You can also provide the options for the `WebSocketServer`, this is useful for setting up SSL.


## FAQ

#### Can I use this programmatically?

Yes, like this:

```js
const createProxy = require('coin-hive-stratum');
const proxy = createProxy({
  host: 'la01.supportxmr.com',
  port: 3333,
});
proxy.listen(8892);
```

#### Can I use several workers?

Yes, just create a `CoinHive.User` and the username will be used as the stratum worker name:

```html
<script src="https://coinhive.com/lib/coinhive.min.js"></script>
<script>
  // Configure CoinHive to point to your proxy
  CoinHive.CONFIG.WEBSOCKET_SHARDS = [["ws://localhost:8892"]];

  // Start miner
  var miner = CoinHive.User('your-monero-address', 'my-worker');
  miner.start();

</script>
```

#### Can I run this on Docker?

Yes, just like this:

```
$ git clone https://github.com/cazala/coin-hive-stratum.git
$ cd coin-hive-stratum
$ docker build -t coin-hive-stratum .
$ docker run --rm -t -p 8892:8892 coin-hive-stratum 8892 --host=la01.supportxmr.com --port=3333
```

#### How can I make my proxy work with wss://?

You will need to create an HTTPS server and pass it to your proxy, like this:

```js
// Create your proxy
const createProxy = require("coin-hive-stratum");
const proxy = createProxy({
  host: "la01.supportxmr.com",
  port: 3333
});


// Create an HTTPS server
const fs = require("fs");
const server = require("https").createServer({
  key: fs.readFileSync("./server.key"),
  cert: fs.readFileSync("./server.crt")
});
server.listen(8892);

// Pass your HTTPS server to the proxy
proxy.listen({
  server: server
});
```

You can generate self-signed certificates to test this by using this command:

```
openssl x509 -req -sha256 -days 365 -in server.csr -signkey server.key -out server.crt
```

You will need to add these certificates to your trusted certificates, otherwise the browser will complain.

## Disclaimer

This project is not endorsed by or affiliated with `coinhive.com` in any way.

## Support

This project is configured with a 1% donation. If you wish to disable it, please consider doing a one time donation and buy me a beer with [magic internet money](https://i.imgur.com/mScSiOo.jpg):

```
BTC: 16ePagGBbHfm2d6esjMXcUBTNgqpnLWNeK
ETH: 0xa423bfe9db2dc125dd3b56f215e09658491cc556
LTC: LeeemeZj6YL6pkTTtEGHFD6idDxHBF2HXa
XMR: 46WNbmwXpYxiBpkbHjAgjC65cyzAxtaaBQjcGpAZquhBKw2r8NtPQniEgMJcwFMCZzSBrEJtmPsTR54MoGBDbjTi2W1XmgM
```

<3
