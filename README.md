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

  --host    The pool's host.
  --port    The pool's port.
  --log     Enable/Disable the logs, default is true
```

## API

- `createServer`: Creates a `proxy` server. It may take an `options` object with the following optional properties:

  - `host`: the pool's host.

  - `port`: the pool's port.

  - `log`: enable/disable the logs, default is `true`.

- `proxy.listen(port)`: launches the server listening on the specified port, which by default is `8892`.


## FAQ

**Can I use this programmatically?**

Yes, like this:

```js
const createProxy = require('coin-hive-stratum');
const proxy = createProxy({
  host: 'xmr-eu1.nanopool.org',
  port: 14444,
});
proxy.listen(8892);
```

**Can I use several workers?**

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

## Disclaimer

This project is not endorsed by or affiliated with `coinhive.com` in any way.
