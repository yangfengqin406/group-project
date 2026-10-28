import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inspectImage } from './image.js'

export class AccountError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const need = (condition, code, message) => { if (!condition) throw new AccountError(code, message) }
const USERS = 'campus.users', SESSIONS = 'campus.sessions', UPLOADS = 'campus.uploads'
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const derivePassword = (password, salt) => scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 })
// Unknown accounts run the same password derivation as known ones.
const dummySalt = '189a6a1934d0445db72cce65772d615f'
const dummyHash = derivePassword('local-campus-invalid-account', dummySalt)
const username = (value) => {
  need(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$/.test(value.trim()),
    'INVALID_ARGUMENT', '账号需为 3～40 位字母、数字、点、下划线或短横线')
  return value.trim().toLowerCase()
}
const passwordValue = (value) => {
  need(typeof value === 'string' && value.length >= 8 && value.length <= 128 && Buffer.byteLength(value) <= 512,
    'INVALID_ARGUMENT', '密码需为 8～128 个字符')
  return value
}
const originValue = (value) => {
  let url
  try { url = new URL(value) } catch { /* Configuration is validated below. */ }
  need(url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
    url.pathname === '/' && !url.search && !url.hash, 'SERVICE_UNAVAILABLE', '文件服务地址配置不正确')
  return url.origin
}
const identifier = (value) => {
  need(typeof value === 'string' && value.length > 0 && value.length <= 200, 'INVALID_ARGUMENT', '编号不正确')
  return value
}

export function createAccounts({ store, uploadsDir, uploadOrigin }) {
  need(store?.database && typeof uploadsDir === 'string' && uploadsDir, 'SERVICE_UNAVAILABLE', '必须配置账号存储和文件目录')
  const directory = resolve(uploadsDir)
  mkdirSync(directory, { recursive: true })
  const configuredOrigin = uploadOrigin ? originValue(uploadOrigin) : null
  const getUser = (id) => typeof id === 'string' ? store.get(USERS, id) : null
  const publicUser = (id) => {
    const value = getUser(id)
    if (!value) return null
    return Object.fromEntries(['id', 'nickname', 'campusId', 'campusName', 'avatarImageId', 'avatarUrl', 'bio', 'skillTags']
      .filter((key) => value[key] !== undefined).map((key) => [key, structuredClone(value[key])]))
  }
  const currentUser = (context) => {
    const value = getUser(context?.userId)
    need(value && !value.disabled, 'UNAUTHENTICATED', '请先登录有效的本地账号')
    return value
  }
  const findAccount = (studentId) => store.query(USERS, "json_extract(data, '$.uniqueKey') = ?", [studentId], 'seq DESC', 1)[0]?.value
  const sessionForToken = (token) => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    const digest = hashToken(token)
    return store.query(SESSIONS, "json_extract(data, '$.uniqueKey') = ?", [digest], 'seq DESC', 1)[0]?.value || null
  }
  const authenticate = (token) => {
    const session = sessionForToken(token)
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return null
    const account = getUser(session.userId)
    return account && !account.disabled ? { userId: account.id } : null
  }
  const createSession = (user) => {
    const token = randomBytes(32).toString('base64url'), createdAt = new Date().toISOString()
    store.insert(SESSIONS, {
      id: randomUUID(), uniqueKey: hashToken(token), userId: user.id,
      createdAt, expiresAt: new Date(Date.now() + SESSION_LIFETIME).toISOString(), revokedAt: null
    })
    return { token, user: publicUser(user.id) }
  }
  const getUpload = (id) => typeof id === 'string' ? store.get(UPLOADS, id) : null
  const getUploadByUrl = (url) => typeof url === 'string' ?
    store.query(UPLOADS, "json_extract(data, '$.url') = ?", [url], 'seq DESC', 1)[0]?.value || null : null

  function receiveUpload({ userId, usage, buffer, mime, origin }) {
    const me = currentUser({ userId })
    need(['content', 'avatar'].includes(usage), 'INVALID_ARGUMENT', '请选择物品图片或头像用途')
    need(Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES,
      'INVALID_ARGUMENT', '图片需大于 0 且不超过 5 MiB')
    const image = inspectImage(buffer)
    need(image, 'INVALID_ARGUMENT', '请选择有效的 JPEG、PNG 或静态 WebP 图片')
    need(!mime || mime === 'application/octet-stream' || mime.toLowerCase() === image.mime,
      'INVALID_ARGUMENT', '图片内容与文件类型不一致')
    // origin is supplied only after the HTTP server verifies its allowed host.
    const base = origin ? originValue(origin) : configuredOrigin
    need(base, 'SERVICE_UNAVAILABLE', '文件服务地址尚未配置')
    const id = randomUUID(), filename = `${id}.${image.extension}`, filePath = join(directory, filename)
    const value = {
      id, imageId: id, ownerId: me.id, usage, url: `${base}/api/files/${id}`,
      status: 'pending', mime: image.mime, size: buffer.length,
      filename, filePath, createdAt: new Date().toISOString()
    }
    let written = false
    try {
      writeFileSync(filePath, buffer, { flag: 'wx', mode: 0o600 })
      written = true
      store.insert(UPLOADS, value)
    } catch {
      if (written) { try { unlinkSync(filePath) } catch { /* Preserve the original failure. */ } }
      throw new AccountError('SERVICE_UNAVAILABLE', '图片保存失败，请稍后重试')
    }
    return { imageId: id, url: value.url }
  }

  function invoke(method, p = {}, context = {}) {
    need(p && typeof p === 'object' && !Array.isArray(p), 'INVALID_ARGUMENT', '请求参数应为对象')
    if (method === 'auth.register') {
      const studentId = username(p.studentId), password = passwordValue(p.password)
      need(typeof p.nickname === 'string' && p.nickname.trim().length >= 1 && p.nickname.trim().length <= 12,
        'INVALID_ARGUMENT', '昵称需为 1～12 个字')
      return store.transaction(() => {
        need(!findAccount(studentId), 'CONFLICT', '这个账号已注册，请登录或换一个账号')
        const salt = randomBytes(16).toString('hex')
        const user = {
          id: randomUUID(), uniqueKey: studentId, studentId, nickname: p.nickname.trim(),
          campusId: 'local-campus', campusName: '本地校园（未核验学籍）',
          bio: '', skillTags: [], avatarUrl: '', roles: [], disabled: false,
          passwordSalt: salt, passwordHash: derivePassword(password, salt).toString('hex'),
          createdAt: new Date().toISOString()
        }
        store.insert(USERS, user)
        return createSession(user)
      })
    }
    if (method === 'auth.login') {
      if (p.type === 'wechat') throw new AccountError('NOT_IMPLEMENTED', '微信登录尚未配置，请使用本地账号；本地账号不代表学籍认证')
      need(p.type === 'h5', 'INVALID_ARGUMENT', '请选择本地账号密码登录')
      const studentId = username(p.studentId), password = passwordValue(p.password)
      const user = findAccount(studentId)
      const actual = derivePassword(password, user?.passwordSalt || dummySalt)
      const expected = user ? Buffer.from(user.passwordHash, 'hex') : dummyHash
      need(actual.length === expected.length && timingSafeEqual(actual, expected) && user && !user.disabled,
        'UNAUTHENTICATED', '账号或密码不正确')
      return store.transaction(() => createSession(user))
    }
    if (method === 'auth.logout') {
      const me = currentUser(context), session = sessionForToken(context.token)
      need(session && session.userId === me.id, 'UNAUTHENTICATED', '当前登录令牌无效')
      if (!session.revokedAt) store.update(SESSIONS, { ...session, revokedAt: new Date().toISOString() })
      return { loggedOut: true }
    }
    if (method === 'upload.confirm') {
      const me = currentUser(context), upload = getUpload(identifier(p.imageId))
      need(upload, 'NOT_FOUND', '图片不存在')
      need(upload.ownerId === me.id, 'FORBIDDEN', '只能确认自己上传的图片')
      const target = p.contentType !== undefined || p.contentId !== undefined
      if (target) {
        need(['market', 'plan', 'help', 'lost_found'].includes(p.contentType) && typeof p.contentId === 'string' && p.contentId,
          'INVALID_ARGUMENT', '图片关联内容不正确')
        need(context.uploadTargetVerified === true, 'FORBIDDEN', '图片关联内容尚未通过服务端验证')
      }
      store.update(UPLOADS, { ...upload, status: 'confirmed', confirmedAt: upload.confirmedAt || new Date().toISOString(),
        ...(target ? { contentType: p.contentType, contentId: p.contentId } : {}) })
      return { imageId: upload.imageId, status: 'confirmed' }
    }
    if (method === 'upload.create') throw new AccountError('NOT_SUPPORTED', '请通过文件上传端点实际传输图片，不能提交临时路径代替文件')
    throw new AccountError('NOT_IMPLEMENTED', '此账号接口尚未实现')
  }

  const verifyPassword = (context, password) => {
    const me = currentUser(context)
    const actual = derivePassword(passwordValue(password), me.passwordSalt)
    const expected = Buffer.from(me.passwordHash, 'hex')
    need(actual.length === expected.length && timingSafeEqual(actual, expected), 'UNAUTHENTICATED', '密码不正确，账号未注销')
    return me
  }
  return { invoke, authenticate, getUser, publicUser, getUpload, getUploadByUrl, receiveUpload, verifyPassword }
}
