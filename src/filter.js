'use strict'

const EventEmitter = require('events')
const async = require('async')
const createFilter = require('bloom-filter').create
const debug = require('debug')('bitcoin-filter')
const inherits = require('inherits')
require('setimmediate')

function fpRate (size, nHashFuncs, elements) {
  return Math.pow(1 - Math.pow(Math.E, -nHashFuncs * elements / size), nHashFuncs)
}

function Filter (peers, opts) {
  if (!(this instanceof Filter)) return new Filter(peers, opts)
  if (!peers || typeof peers.send !== 'function') {
    throw new Error('Must provide "peers" argument')
  }
  EventEmitter.call(this)

  opts = opts || {}
  this._peers = peers
  this._targetFPRate = opts.falsePositiveRate || 0.001
  this._resizeThreshold = opts.resizeThreshold || 0.4
  this._elements = []
  this._filterables = []
  this._count = 0
  this._filter = null
  this.initialized = false

  setImmediate(() => {
    this.initialized = true
    debug(`sending initial filter: elements:${this._count}`)
    this._resize(this._error.bind(this))
    peers.on('peer', (peer) => {
      debug(`sending "filterload" to peer: ${peer.socket.remoteAddress}`)
      peer.send('filterload', this._getPayload())
    })
    this.emit('init')
    this.emit('ready')
  })
}

inherits(Filter, EventEmitter)

Filter.prototype._error = function (err) {
  if (err) this.emit('error', err)
}

Filter.prototype.onceReady = function (cb) {
  if (this.initialized) return cb()
  this.once('ready', cb)
}

Filter.prototype.add = function (value, cb) {
  cb = cb || this._error.bind(this)
  var add = Buffer.isBuffer(value)
    ? this._addStaticElement : this._addFilterable
  add.call(this, value, (err) => {
    if (err) return cb(err)
    this._maybeResize(cb)
  })
}

Filter.prototype.remove = function (value) {
  if (Buffer.isBuffer(value)) {
    // TODO
  } else {
    // TODO
  }
}

Filter.prototype._addStaticElement = function (data, cb) {
  var element = Buffer(data.length)
  data.copy(element)
  this._elements.push(element)
  this._addElement(element)
  debug(`static element added: ${element.toString('hex')}`)
  cb(null)
}

Filter.prototype._addFilterable = function (filterable, cb) {
  this._addFilterableElements(filterable, (err) => {
    if (err) return cb(err)
    this._filterables.push(filterable)
    filterable.on('filteradd', (data) => {
      if (Array.isArray(data)) {
        for (var element of data) this._addElement(element)
      } else {
        this._addElement(data)
      }
    })
    cb(null)
  })
}

Filter.prototype._addFilterableElements = function (filterable, cb) {
  if (!this.initialized) {
    cb(null)
    return
  }
  var called = false
  var done = (err, elements) => {
    called = true
    cb(err, elements)
  }
  var addElements = (err, elements, sync) => {
    if (called) {
      if (err) return this._error(err)
      return this._error(new Error('Filterable#filterElements() returned elements via both async cb and sync return'))
    }
    if (err) return done(err)
    if (!elements) {
      if (elements === null || !sync) done(null)
      return
    }
    if (elements && !Array.isArray(elements)) {
      return done(new Error('"filterElements()" must return an array of Buffers or null/undefined'))
    }
    this._addElements(elements, false)
    debug(`initial filterable elements added:${elements ? elements.length : 0}`)
    return done(null, elements)
  }
  var asyncAddElements = (...args) => {
    setImmediate(() => addElements(...args))
  }
  addElements(null, filterable.filterElements(asyncAddElements), true)
}

Filter.prototype._addElement = function (data, send) {
  send = send == null ? true : send
  this._count++

  if (!this._filter) return
  this._filter.insert(data)

  if (send) {
    debug(`sending "filteradd": ${data.toString('hex')}`)
    this._peers.send('filteradd', { data }, false)
  }
}

Filter.prototype._falsePositiveRate = function () {
  return fpRate(this._filter.vData.length * 8,
    this._filter.nHashFuncs, Math.max(this._count, 100))
}

Filter.prototype._getPayload = function () {
  var output = this._filter.toObject()
  output.data = output.vData
  delete output.vData
  return output
}

Filter.prototype._maybeResize = function (cb) {
  if (!this._filter) return cb(null)
  var fpRate = this._falsePositiveRate()
  var threshold = this._resizeThreshold * this._targetFPRate
  if (fpRate - this._targetFPRate >= threshold) {
    debug(`resizing: fp=${fpRate}, target=${this._targetFPRate}`)
    return this._resize(cb)
  }
  cb(null)
}

Filter.prototype._addElements = function (elements, send) {
  for (let element of elements) this._addElement(element, send)
}

Filter.prototype._resize = function (cb) {
  this._filter = createFilter(
    Math.max(this._count, 100),
    this._targetFPRate,
    Math.floor(Math.random() * 0xffffffff)
  )
  this._count = 0
  this._addElements(this._elements, false)

  var filterables = this._filterables
  this._filterables = []
  async.each(filterables, this._addFilterableElements.bind(this), (err) => {
    if (err) return cb(err)
    this._peers.send('filterload', this._getPayload(), false)
    cb(null)
  })
}

module.exports = Filter
