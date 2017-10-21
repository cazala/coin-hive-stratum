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
coin-hive-stratum 8892 --host=xmr-eu1.nanopool.org --port=14444
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

Now your CoinHive miner would be mining on `nanopool.org` XMR pool, using your monero address. This will work for any pool based on the [Stratum Mining Protocol](https://en.bitcoin.it/wiki/Stratum_mining_protocol). You can even set up [your own](https://github.com/zone117x/node-stratum-pool).


## CLI

```
Usage: 'coin-hive-stratum <port>'

<port>: The port where the server will listen to

Options:

  --host      The pool's host.
  --port      The pool's port.
  --pass      The pool's password, by default it's "x"
  --log       Enable/Disable the logs, default is true
  --log-file  A filename where the logs will be stored, ie: proxy.log
```

## API

- `createProxy`: Creates a `proxy` server. It may take an `options` object with the following optional properties:

  - `host`: the pool's host.

  - `port`: the pool's port.

  - `pass`: the pool's password, default is `"x"`.

  - `log`: enable/disable the logs, default is `true`.

  - `logFile`: a filename where the logs will be stored, ie: `"proxy.log"`.

- `proxy.listen(port)`: launches the server listening on the specified port, which by default is `8892`.


## FAQ

#### Can I use this programmatically?

Yes, like this:

```js
const createProxy = require('coin-hive-stratum');
const proxy = createProxy({
  host: 'xmr-eu1.nanopool.org',
  port: 14444,
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
$ docker run --rm -t -p 8892:8892 coin-hive-stratum 8892 --host=xmr-eu1.nanopool.org --port=14444
```

#### Can the logs be stored?

There's no built in solution, but you can pipe the logs into a file like this:

```
coin-hive-stratum 8892 --host=xmr-eu1.nonapool.org --port 14444 > proxy.log &
```

## Disclaimer

This project is not endorsed by or affiliated with `coinhive.com` in any way.

## Support

If you like this project and you want to show your support, you can buy me a beer with [magic internet money](https://i.imgur.com/mScSiOo.jpg):

```
BTC: 16ePagGBbHfm2d6esjMXcUBTNgqpnLWNeK
ETH: 0xa423bfe9db2dc125dd3b56f215e09658491cc556
XMR: 46WNbmwXpYxiBpkbHjAgjC65cyzAxtaaBQjcGpAZquhBKw2r8NtPQniEgMJcwFMCZzSBrEJtmPsTR54MoGBDbjTi2W1XmgM
```

<3
