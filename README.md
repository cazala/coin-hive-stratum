## CoinHive Stratum Proxy

<img width="1356" alt="pm2" src="https://user-images.githubusercontent.com/2781777/33243231-c162d55c-d2c0-11e7-9408-c3fb7fb699d0.png">

This proxy allows you to use CoinHive's JavaScript miner on a custom stratum pool.

This package was inspired by x25's
[coinhive-stratum-mining-proxy](https://github.com/x25/coinhive-stratum-mining-proxy).

## Guides

- Deploy this proxy for free to `now.sh` + GitHub Pages and avoid AdBlock.
[Learn More](https://github.com/cazala/coin-hive-stratum/wiki/Deploy-to-now.sh-and-GitHub-Pages)

- Run proxy with `pm2` and get load balancing, cluster mode, watch & reload, and live metrics.
[Learn More](https://github.com/cazala/coin-hive-stratum/wiki/Run-with-PM2)

## Installation

```
npm install -g coin-hive-stratum
```

## Usage

You just need to launch a proxy pointing to the desired pool:

```
coin-hive-stratum 8892 --host=pool.supportxmr.com --port=3333
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

Now your CoinHive miner would be mining on `supportXMR.com` pool, using your monero address. This will work for any pool
based on the [Stratum Mining Protocol](https://en.bitcoin.it/wiki/Stratum_mining_protocol). You can even set up
[your own](https://github.com/zone117x/node-stratum-pool).

## Stats

You can see your proxy stats (number of miners and connections) by hittings `/stats`, ie: `https://localhost:8892/stats`.

To get more advanced metrcis you will have to [run the proxy with PM2](https://github.com/cazala/coin-hive-stratum/wiki/Run-with-PM2).

## CLI

```
Usage: 'coin-hive-stratum <port>'

<port>: The port where the server will listen to

Options:

  --host                        The pool's host.
  --port                        The pool's port.
  --pass                        The pool's password, by default it's "x".
  --ssl                         Use SSL/TLS to connect to the pool.
  --address                     A fixed wallet address for all the miners.
  --user                        A fixed user for all the miners.
  --diff                        A fixed difficulty for all the miner. This is not supported by all the pools.
  --dynamic-pool                If true, the pool can be set dynamically by sending a ?pool=host:port:pass query param to the websocket endpoint.
  --max-miners-per-connection   Set the max amount of miners per TCP connection. When this number is exceded, a new socket is created. By default it's 100.
  --path                        Accept connections on a specific path.
  --key                         Path to private key file. Used for HTTPS/WSS.
  --cert                        Path to certificate file. Used for HTTPS/WSS.
```

## API

* `createProxy`: Creates a `proxy` server. It may take an `options` object with the following optional properties:

  * `host`: the pool's host.

  * `port`: the pool's port.

  * `pass`: the pool's password, default is `"x"`.

  * `ssl`: use SSL/TLS to connect to the pool.

  * `address`: a fixed wallet address for all the miners.

  * `user`: a fixed user for all the miners.

  * `diff`: a fixed difficulty for all the miners.

  * `dynamicPool`: if true, the pool can be set dynamically by sending a `?pool=host:port:pass` query param to the
    websocket endpoint.

  * `maxMinersPerConnection`: max amount of miners per TCP connection, when this number is exceded, a new socket is
    created. Default it's `100`.

  * `path`: accept connections on a specific path (ie: '/proxy').

  * `server`: use a custom http/https server.

  * `key`: path to private key file (used for https/wss).

  * `cert`: path to certificate file (used for https/wss).

* `proxy.listen(port)`: launches the server listening on the specified port, which by default is `8892`.

## FAQ

#### Can I use this programmatically?

Yes, like this:

```js
const createProxy = require("coin-hive-stratum");
const proxy = createProxy({
  host: "la01.supportxmr.com",
  port: 3333
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

Yes, use a `Dockerfile` like this:

```
FROM node:8-slim

# Install coin-hive-stratum
RUN npm i -g coin-hive-stratum --unsafe-perm=true --allow-root

# Run coin-hive-stratum
ENTRYPOINT ["coin-hive-stratum"]
```

Now build the image:

```
$ docker build -t coin-hive-stratum .
```

And run the image:

```
$ docker run --rm -t -p 8892:8892 coin-hive-stratum 8892 --host=pool.supportxmr.com --port=3333
```

#### How can I make my proxy work with wss://?

You will need to pass a private key file and a certificate file to your proxy:

```js
const Proxy = require("coin-hive-stratum");
const proxy = new Proxy({
  host: "la01.supportxmr.com",
  port: 3333,
  key: fs.readFileSync("./server.key"),
  cert: fs.readFileSync("./server.crt")
});
proxy.listen(8892);
```

Now you can connect to your proxy using `wss://` and see the `/stats` though `https://`.

You can generate self-signed certificates to test this by using this command:

```
openssl x509 -req -sha256 -days 365 -in server.csr -signkey server.key -out server.crt
```

You will need to add these certificates to your trusted certificates, otherwise the browser will complain.

#### How can I store the logs?

You have to run the proxy [using PM2](https://github.com/cazala/coin-hive-stratum/wiki/Run-with-PM2) and pass a
`--log=path/to/log.txt` argument when you start the proxy.

#### How can I see the metrics?

You can hit `/stats` to get some basic stats (number of miners and connections).

To full metrics you have to run the proxy [using PM2](https://github.com/cazala/coin-hive-stratum/wiki/Run-with-PM2).

#### How can I avoid AdBlock?

You can deploy the proxy to now.sh and GitHub Pages using
[this guide](https://github.com/cazala/coin-hive-stratum/wiki/Deploy-to-now.sh-and-GitHub-Pages), or you can deploy the
proxy to your own server and serve [these assets](https://github.com/cazala/coin-hive-stratum/tree/gh-pages) from your
server.

If you use those assets, the `CoinHive` global variable will be accessible as `CH`.

## Disclaimer

This project is not endorsed by or affiliated with `coinhive.com` in any way.

## Support

This project is configured with a 1% donation. If you wish to disable it, please consider doing a one time donation and
buy me a beer with [magic internet money](https://i.imgur.com/mScSiOo.jpg):

```
BTC: 16ePagGBbHfm2d6esjMXcUBTNgqpnLWNeK
ETH: 0xa423bfe9db2dc125dd3b56f215e09658491cc556
LTC: LeeemeZj6YL6pkTTtEGHFD6idDxHBF2HXa
XMR: 46WNbmwXpYxiBpkbHjAgjC65cyzAxtaaBQjcGpAZquhBKw2r8NtPQniEgMJcwFMCZzSBrEJtmPsTR54MoGBDbjTi2W1XmgM
```

<3
