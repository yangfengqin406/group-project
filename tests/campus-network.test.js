import test from 'node:test'
import assert from 'node:assert/strict'
import { localAddresses } from '../backend/campus/network.js'

const ipv4 = (address, changes = {}) => ({ address, family: 'IPv4', internal: false, ...changes })

test('网络候选：APIPA排在前面时仍选择有效Wi-Fi，且排除未指定监听地址', () => {
  const addresses = localAddresses({
    ethernet: [ipv4('169.254.38.106'), ipv4('0.0.0.0')],
    hotspot: [ipv4('169.254.26.121')],
    wlan: [ipv4('10.23.42.8')]
  })
  assert.deepEqual(addresses, ['127.0.0.1', 'localhost', '10.23.42.8'])
  assert.equal(addresses.find((host) => !['127.0.0.1', 'localhost'].includes(host)), '10.23.42.8')
})

test('网络候选：不把环回、内部接口或IPv6作为局域网地址', () => {
  assert.deepEqual(localAddresses({
    loopback: [ipv4('127.0.0.1', { internal: true }), ipv4('127.9.8.7')],
    virtual: [ipv4('10.20.30.40', { internal: true })],
    ipv6: [{ address: 'fe80::abcd', family: 'IPv6', internal: false }, ipv4('::1')]
  }), ['127.0.0.1', 'localhost'])
})

test('网络候选：保留合法IPv4的顺序并跨接口去重，拒绝损坏地址', () => {
  assert.deepEqual(localAddresses({
    first: [ipv4('192.168.1.10'), ipv4('256.1.2.3'), ipv4('1.2.3'), ipv4('01.2.3.4')],
    second: [ipv4('192.168.1.10'), ipv4('172.16.8.9', { family: 4 }), ipv4('203.0.113.9')],
    broken: [ipv4(''), ipv4(undefined), ipv4(123), ipv4(['1.2.3.4']), null]
  }), ['127.0.0.1', 'localhost', '192.168.1.10', '172.16.8.9', '203.0.113.9'])
})

test('网络候选：没有有效网络时仍保留本机回环地址', () => {
  assert.deepEqual(localAddresses({}), ['127.0.0.1', 'localhost'])
  assert.deepEqual(localAddresses({ disconnected: null, empty: [] }), ['127.0.0.1', 'localhost'])
  assert.deepEqual(localAddresses(null), ['127.0.0.1', 'localhost'])
})
