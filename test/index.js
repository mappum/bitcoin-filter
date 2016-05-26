var wrapEvents = require('event-cleanup')
var EventEmitter = require('events')
var test = require('tape')
var Filter = require('../')
var inherits = require('util').inherits

test('create filter', function (t) {
  t.test('normal constructor', function (t) {
    var peer = new MockPeer()
    var f = new Filter(peer)
    t.ok(f instanceof Filter, 'got Filter')
    f.once('init', function () {
      t.pass('"init" event emitted')
      t.end()
    })
  })

  t.test('constructor without "new"', function (t) {
    var peer = new MockPeer()
    var f = Filter(peer)
    t.ok(f instanceof Filter, 'got Filter')
    f.once('init', function () {
      t.pass('"init" event emitted')
      t.end()
    })
  })

  t.test('constructor without peer', function (t) {
    try {
      var f = new Filter()
      t.notOk(f, 'should have thrown')
    } catch (err) {
      t.ok(err, 'error was thrown')
      t.equal(err.message, 'Must provide "peers" argument')
      t.end()
    }
  })

  t.end()
})

test('using PeerGroup', function (t) {
  var peers, f
  t.test('create filter', function (t) {
    peers = new MockPeer()
    f = new Filter(peers)
    f.once('init', t.end.bind(t))
  })

  t.test('peer added', function (t) {
    var peer = new MockPeer()
    peer.once('filterload', function (payload) {
      t.pass('"filterload" message sent to new peer')
      t.end()
    })
    peers.emit('peer', peer)
  })

  t.end()
})

test('adding Buffer elements', function (t) {
  var peer, f
  t.test('create filter', function (t) {
    peer = new MockPeer()
    f = new Filter(peer, {
      falsePositiveRate: 0.1,
      resizeThreshold: 0.5
    })
    f.once('init', t.end.bind(t))
  })

  t.test('add elements', function (t) {
    var events = wrapEvents(peer)
    events.on('filteradd', function (payload) {
      t.pass('"filteradd" message sent to peer')
    })
    events.on('filterload', function (payload) {
      t.fail('should not have resized filter')
    })
    for (var i = 0; i < 119; i++) {
      f.add(new Buffer(i + ''))
    }
    events.removeAll()
    t.end()
  })

  t.test('add element and resize', function (t) {
    var events = wrapEvents(peer)
    events.on('filterload', function (payload) {
      t.pass('"filterload" sent to peer')
    })
    f.add(new Buffer('lol'))
    events.removeAll()
    t.end()
  })

  t.test('add with callback', function (t) {
    f.add(new Buffer('test'), (err) => {
      t.pass('callback called')
      t.error(err, 'no error')
      t.end()
    })
  })

  t.end()
})

test('Filterables', function (t) {
  var peer, f
  t.test('create filter', function (t) {
    peer = new MockPeer()
    f = new Filter(peer, {
      falsePositiveRate: 0.1,
      resizeThreshold: 0.5
    })
    f.once('init', t.end.bind(t))
  })

  var nElements = 0
  var nFilterables = 0

  t.test('add to filter', function (t) {
    t.test('add filterable with invalid initial elements', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function () { return 'test' }
      f.add(filterable, (err) => {
        t.pass('callback called')
        t.ok(err, 'err returned to callback')
        t.equal(err.message, '"filterElements()" must return an array of Buffers or null/undefined', 'correct error message')
        t.equal(f._filterables.length, nFilterables, 'filterable not added')
        t.equal(f._count, nElements, 'no elements added')
        t.end()
      })
    })

    t.test('add filterable with null initial elements', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function () { return null }
      f.add(filterable, (err) => {
        t.pass('callback called')
        t.error(err, 'no err returned to callback')
        nFilterables++
        t.equal(f._filterables.length, nFilterables, 'filterable added')
        t.equal(f._count, nElements, 'no elements added')
        t.end()
      })
    })

    t.test('add filterable with invalid async initial elements', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function (cb) {
        t.ok(cb, 'cb passed to "filterElements()"')
        cb(null, 123)
      }
      f.add(filterable, function (err) {
        t.pass('callback called')
        t.ok(err, 'err returned to callback')
        t.equal(err.message, '"filterElements()" must return an array of Buffers or null/undefined', 'correct error message')
        t.equal(f._filterables.length, nFilterables, 'filterable not added')
        t.equal(f._count, nElements, 'no elements added')
        t.end()
      })
    })

    t.test('add filterable with async error', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function (cb) {
        t.ok(cb, 'cb passed to "filterElements()"')
        cb(new Error('uh oh'), [ new Buffer('akfjsdhks') ])
      }
      f.add(filterable, function (err) {
        t.pass('callback called')
        t.ok(err, 'err returned to callback')
        t.equal(err.message, 'uh oh', 'correct error message')
        t.equal(f._filterables.length, nFilterables, 'filterable not added')
        t.equal(f._count, nElements, 'no elements added')
        t.end()
      })
    })

    t.test('add filterable with both sync and async initial elements', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function (cb) {
        t.ok(cb, 'cb passed to "filterElements()"')
        cb(null, [])
        return []
      }
      f.once('error', function (err) {
        t.pass('error emitted')
        t.ok(err, 'got error')
        t.equal(err.message, 'Filterable#filterElements() returned elements via both async cb and sync return', 'correct error message')
        t.end()
      })
      f.add(filterable, function (err) {
        t.pass('callback called')
        t.error(err, 'no err returned to callback')
        nFilterables++
        t.equal(f._filterables.length, nFilterables, 'filterable added')
        t.equal(f._count, nElements, 'no elements added')
      })
    })

    t.test('add filterable with valid initial elements', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function () {
        return [ new Buffer('a'), new Buffer('b'), new Buffer('c') ]
      }
      f.add(filterable, function (err) {
        t.pass('callback called')
        t.error(err, 'no err returned to callback')
        nFilterables++
        t.equal(f._filterables.length, nFilterables, 'filterable added')
        nElements += 3
        t.equal(f._count, nElements, 'elements added')
        t.end()
      })
    })

    t.test('add filterable with valid async initial elements', function (t) {
      var filterable = new EventEmitter()
      filterable.filterElements = function (cb) {
        return cb(null, [ new Buffer('d'), new Buffer('e'), new Buffer('f') ])
      }
      f.add(filterable, function (err) {
        t.pass('callback called')
        t.error(err, 'no err returned to callback')
        nFilterables++
        t.equal(f._filterables.length, nFilterables, 'filterable added')
        nElements += 3
        t.equal(f._count, nElements, 'elements added')
        t.end()
      })
    })
  })

  t.test('add via "filteradd" event', function (t) {
    var filterable = new EventEmitter()
    filterable.filterElements = function () { return null }
    f.add(filterable)
    nFilterables++

    t.test('single buffer', function (t) {
      filterable.emit('filteradd', new Buffer('foo'))
      nElements++
      t.equal(f._count, nElements, 'element added')
      t.end()
    })

    t.test('array of buffers', function (t) {
      filterable.emit('filteradd', [ new Buffer('bar'), new Buffer('baz') ])
      nElements += 2
      t.equal(f._count, nElements, 'elements added')
      t.end()
    })

    t.end()
  })

  t.test('add before filter is initialized', function (t) {
    var peer = new MockPeer()
    var f = new Filter(peer)
    var filterable = new EventEmitter()
    filterable.filterElements = function () {
      return [ new Buffer('a'), new Buffer('b') ]
    }
    f.add(filterable, function (err) {
      t.error(err, 'no error')
      t.equal(f._filterables.length, 1, 'filterable added')
    })
    f.once('ready', function () {
      t.equal(f._count, 2, 'elements added')
      t.end()
    })
  })

  t.end()
})

function MockPeer () {
  EventEmitter.call(this)
  this.socket = { remoteAddress: 'x' }
}
inherits(MockPeer, EventEmitter)

MockPeer.prototype.send = function (message, payload) {
  this.emit(message, payload)
}
