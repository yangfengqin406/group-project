import { call } from './transport.js'
export const unread = () => call('conversation.unread')
export const markRead = (params) => call('conversation.markRead', params)
export const get = (params = {}) => call('conversation.get', params)
export const open = (params = {}) => call('conversation.open', params)
export const list = (params = {}) => call('conversation.list', params)
