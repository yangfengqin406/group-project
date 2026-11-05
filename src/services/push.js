import { call } from './transport.js'
export const status = () => call('push.status')
export const bind = (params) => call('push.bind', params)
export const unbind = (params) => call('push.unbind', params)
