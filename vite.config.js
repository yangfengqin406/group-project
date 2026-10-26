import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import { weixinRoomChunks } from './scripts/weixin-room-chunks.mjs'
const uni = uniModule.default || uniModule
export default defineConfig({
  plugins: [uni(), weixinRoomChunks()],
  server: { port: 5173, strictPort: true }
})
