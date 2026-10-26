const ROOM_CHUNKS = new Set(['services/landlord', 'services/game-transport', 'utils/game-session'])
const roomFile = (name) => `rooms/${name}.js`

// Keep services in src/services while emitting the card table's private modules
// into its subpackage. Rollup rewrites imports before rendering the output.
export function weixinRoomChunks(platform = process.env.UNI_PLATFORM) {
  return {
    name: 'campus-weixin-room-chunks',
    apply: 'build',
    enforce: 'post',
    outputOptions(options) {
      if (platform !== 'mp-weixin') return
      const original = options.chunkFileNames
      return {
        ...options,
        chunkFileNames(chunk) {
          if (ROOM_CHUNKS.has(chunk.name)) return roomFile(chunk.name)
          return typeof original === 'function' ? original.call(this, chunk) : original || '[name]-[hash].js'
        }
      }
    },
    generateBundle(_options, bundle) {
      if (platform !== 'mp-weixin') return
      const privateFiles = new Set([...ROOM_CHUNKS].map(roomFile))
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || chunk.fileName.startsWith('rooms/')) continue
        const crossed = [...chunk.imports, ...chunk.dynamicImports].find((name) => privateFiles.has(name))
        if (crossed) this.error(`牌桌专用代码 ${crossed} 被 ${chunk.fileName} 跨分包引用，请先协调该服务的共享范围。`)
      }
    }
  }
}
