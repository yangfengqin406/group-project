import { call } from './transport.js'

export const getState = (params = {}) => call('rewards.getState', params)
