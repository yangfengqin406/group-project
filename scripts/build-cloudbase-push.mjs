import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist/cloudbase', `push-worker-${Date.now()}`)
function copy(source, target) {
  mkdirSync(target, { recursive:true })
  for (const entry of readdirSync(source, { withFileTypes:true })) {
    if (entry.isSymbolicLink()) throw new Error('Deployment source cannot contain links')
    if (entry.isDirectory()) copy(join(source,entry.name),join(target,entry.name))
    else if (entry.isFile()) copyFileSync(join(source,entry.name),join(target,entry.name))
    else throw new Error('Unexpected worker deployment source')
  }
}
for (const relative of ['backend','server/landlord','src/domain','src/utils']) copy(join(root,relative),join(output,relative))
// Keep the SCF handler compatible with its CommonJS loader while the original
// business modules retain their explicit ES-module package boundaries.
writeFileSync(join(output,'package.json'),JSON.stringify({name:'campus-cloud-push-worker',private:true,engines:{node:'>=22 <23'}},null,2)+'\n')
for (const relative of ['backend','server','src'])
  writeFileSync(join(output,relative,'package.json'),'{"type":"module"}\n')
writeFileSync(join(output,'index.js'),"exports.main = async event => (await import('./backend/cloudbase/push-entry.mjs')).main(event)\n")
console.log(JSON.stringify({output,dependencyInstall:false,credentialsIncluded:false}))
