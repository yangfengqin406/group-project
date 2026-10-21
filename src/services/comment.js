import { call } from './transport.js'

export const create = (params = {}) => call('comment.create', params)
export const list = (params = {}) => call('comment.list', params)
