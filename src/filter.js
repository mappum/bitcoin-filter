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
  })
}

inherits(Filter, EventEmitter)

Filter.prototype._error = function (err) {
  if (err) this.emit('error', err)
}

Filter.prototype.add = function (value) {
  if (Buffer.isBuffer(value)) {
    this._addStaticElement(value)
  } else {
    this._addFilterable(value)
  }
  this._maybeResize()
}

Filter.prototype.remove = function (value) {
  if (Buffer.isBuffer(value)) {
    // TODO
  } else {
    // TODO
  }
}

Filter.prototype._addStaticElement = function (data) {
  var element = Buffer(data.length)
  data.copy(element)
  this._elements.push(element)
  this._addElement(element)
  debug(`static element added: ${element.toString('hex')}`)
}

Filter.prototype._addFilterable = function (filterable, cb) {
  this._filterables.push(filterable)
  filterable.on('filteradd', (data) => {
    if (Array.isArray(data)) {
      for (var element of data) this._addElement(element)
    } else {
      this._addElement(data)
    }
  })
  this._addFilterableElements(filterable, cb)
}

Filter.prototype._addFilterableElements = function (filterable, cb) {
  if (!this.initialized) {
    if (cb) cb(null)
    return
  }
  var done = false
  var addElements = (elements) => {
    if (done) return
    if (!elements) return
    if (elements && !Array.isArray(elements)) {
      return cb(new Error('"filterElements()" must return an array of Buffers or null/undefined'))
    }
    this._addElements(elements, false)
    done = true
    debug(`initial filterable elements added:${elements ? elements.length : 0}`)
    if (cb) cb(null, elements)
  }
  addElements(filterable.filterElements(addElements))
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
  return output
}

Filter.prototype._maybeResize = function () {
  if (!this._filter) return
  var fpRate = this._falsePositiveRate()
  var threshold = this._resizeThreshold * this._targetFPRate
  if (fpRate - this._targetFPRate >= threshold) {
    debug(`resizing: fp=${fpRate}, target=${this._targetFPRate}`)
    this._resize(this._error.bind(this))
  }
}

Filter.prototype._addElements = function (elements, send) {
  for (let element of elements) this._addElement(element, send)
}

Filter.prototype._resize = function (cb) {
  this._filter = createFilter(Math.max(this._count, 100), this._targetFPRate)
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
