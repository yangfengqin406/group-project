import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createPgRepository } from './pg-repository.js'
import { createPgCloudFiles } from './pg-files.js'
import { createCloudEngine, createCloudCoordinator } from './engine.js'
import { createCloudHttpServer } from './http.js'

const envId = process.env.CAMPUS_CLOUDBASE_ENV
const accessKey = process.env.CAMPUS_CLOUDBASE_KEY
const publicOrigin = process.env.CAMPUS_PUBLIC_ORIGIN
const staticRoot = resolve(process.env.CAMPUS_STATIC_ROOT || fileURLToPath(new URL('../../public', import.meta.url)))
const repository = createPgRepository({ envId, accessKey, table: process.env.CAMPUS_CLOUDBASE_TABLE || 'campus_runtime' })
const files = createPgCloudFiles({ envId, accessKey, bucket: process.env.CAMPUS_CLOUDBASE_BUCKET || 'campus-private' })
const engine = createCloudEngine({ files, publicOrigin, staticRoot })
const coordinator = createCloudCoordinator({ repository, engine, files })
const server = createCloudHttpServer({ coordinator, repository, publicOrigin, staticRoot })
const port = Number(process.env.PORT || 9000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid service port')
server.listen(port, '0.0.0.0', () => console.log('Campus CloudBase HTTP service ready'))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
