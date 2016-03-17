'use strict'

const EventEmitter = require('events')
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

  this._peers = peers
  this._targetFPRate = opts.falsePositiveRate || 0.01
  this._resizeThreshold = opts.resizeThreshold || 0.6
  this._elements = []
  this._filterables = []
  this._count = 0
  this._filter = null

  setImmediate(() => {
    debug(`sending initial filter: elements:${this._count}`)
    this._resize()
    this.emit('init')
  })
}

inherits(Filter, EventEmitter)

Filter.prototype.add = function (value) {
  if (Buffer.isBuffer(value)) {
    this._addStaticElement(value)
  } else {
    this._addFilterable(value)
  }
}

Filter.prototype.remove = function (value) {
  if (Buffer.isBuffer(value)) {
    // TODO
  } else {
    // TODO
  }
}

Filter.prototype._addStaticElement = function (data) {
  this._elements.push(data)
  this._addElement(data)
  debug(`static element added: ${data.toString('hex')}`)
}

Filter.prototype._addFilterable = function (filterable) {
  this._filterables.push(filterable)
  filterable.on('filteradd', this._addElement.bind(this))
  var elements = filterable.filterElements()
  if (elements) {
    for (var element of elements) this._addElement(element)
  }
  debug(`filterable added: initial elements:${elements ? elements.length : 0}`)
}

Filter.prototype._addElement = function (data, send) {
  send = send == null
  this._count++

  var fpRate = this._falsePositiveRate()
  var threshold = this._resizeThreshold * this._targetFPRate
  if (fpRate - this._targetFPRate >= threshold) {
    debug(`resizing: fp=${fpRate}, target=${this._targetFPRate}`)
    return this._resize()
  }

  if (!this._filter) return
  this._filter.insert(data)
  if (!send) return
  debug(`sending "filteradd": ${data.toString('hex')}`)
  this._peers.send('filteradd', { data })
}

Filter.prototype._falsePositiveRate = function () {
  return fpRate(this._filter.vData.length * 8, this._filter.nHashFuncs, this._count)
}

Filter.prototype._getPayload = function () {
  var output = this._filter.toObject()
  output.data = new Buffer(output.vData)
  delete output.vData
  return output
}

Filter.prototype._resize = function () {
  this._filter = createFilter(this._count, this._targetFPRate)
  this._count = 0
  for (let element of this._elements) this._addElement(element, false)
  for (let filterable of this._filterables) {
    var elements = filterable.filterElements()
    if (!elements) continue
    for (let element of elements) this._addElement(element, false)
  }
  this._peers.send('filterload', this._getPayload())
}

module.exports = Filter
