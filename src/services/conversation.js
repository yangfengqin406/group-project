import { call } from './transport.js'
export const get = (params = {}) => call('conversation.get', params)
export const open = (params = {}) => call('conversation.open', params)
export const list = (params = {}) => call('conversation.list', params)
