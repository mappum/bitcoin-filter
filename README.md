# bitcoin-filter

[![npm version](https://img.shields.io/npm/v/bitcoin-filter.svg)](https://www.npmjs.com/package/bitcoin-filter)
[![Build Status](https://travis-ci.org/mappum/bitcoin-filter.svg?branch=master)](https://travis-ci.org/mappum/bitcoin-filter)
[![Dependency Status](https://david-dm.org/mappum/bitcoin-filter.svg)](https://david-dm.org/mappum/bitcoin-filter)

**Bitcoin connection Bloom filtering (BIP37)**

`bitcoin-filter` is used to set connection Bloom filters for Bitcoin light clients, so that we only receive relevant transactions. It should be used with the [`bitcoin-net`](https://github.com/mappum/bitcoin-net) package.

## Usage

`npm install bitcoin-filter`

```js
var PeerGroup = require('bitcoin-net')
var Filter = require('bitcoin-filter')

var peers = new PeerGroup(params)
var filter = new Filter(peers)
filter.add(new Buffer('818895f3dc2c178629d3d2d8fa3ec4a3f8179821', 'hex'))
filter.add(walletObject)
```

### API

#### `Filter`

##### `var filter = new Filter(peers, [opts])`

Creates a new Bloom filter, which gets sent to peers in `peers` (a `bitcoin-net` `PeerGroup` instance). Elements can be added to the filter, and it will be updated on the remote peers. It will also be sent to new peers which get connected through the `PeerGroup`.

`opts` can contain the following properties:
 - `falsePositiveRate`, *Number* (default: `0.01`) - The filter parameters (size and number of hash functions) will be adjusted to maintain this false positive rate as elements are added. A higher value uses more bandwidth since more transactions are sent, but a lower value is less anonymous since remote peers have a better idea of which transactions are yours.
 - `resizeThreshold`, *Number* (default: `0.6`) - When the actual false positive rate exceeds `falsePositiveRate * resizeThreshold`, the filter will be resized to bring the false positive rate back to the target.

----
##### `filter.add(element)`

Adds an element or an object that implements the [`Filterable`](#interface-filterable) interface to the filter.

`element` should be a `Buffer` or [`Filterable`](#interface-filterable).

If `element` is a `Buffer`, it will be kept in memory since it will be used if the filter needs to be recalculated.

----
##### `filter.remove(element)`

Removes an element or an object that implements the `Filterable` interface from the filter.

`element` should be a `Buffer` or [`Filterable`](#interface-filterable).

----
#### Interface: `Filterable`

Objects can implement this interface so their elements can be easily added to the Bloom filter without being kept in memory. This can be useful for instance for a wallet that manages many keys which should be added to the filter.

Using this interface saves a lot of memory over just adding the elements as `Buffer`s, since we only need the elements when recalculating the filter and we can usually just recalculate them (e.g. deriving HD keys).

----
##### `filterable.filterElements()`

This method will be called when the `Filterable` is first added to the filter, or when the filter needs to recalculate. It should return an array of `Buffer`s, which are all of the filter elements this `Filterable` has created so far (e.g. the keys of a wallet).

----
##### Event: `filteradd`

- *Buffer* - An element that should be added to the filteradd

This event should be emitted whenever a new element should be added to the filter.
