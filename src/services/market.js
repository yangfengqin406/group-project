import { call } from './transport.js'
export const create = (params = {}) => call('market.create', params)
export const update = (params = {}) => call('market.update', params)
export const get = (params = {}) => call('market.get', params)
export const list = (params = {}) => call('market.list', params)
export const close = (params = {}) => call('market.close', params)
export const complete = (params = {}) => call('market.complete', params)
export const reserve = (params = {}) => call('market.reserve', params)
export const getCandidates = (params = {}) =>
  call('market.getCandidates', params)
