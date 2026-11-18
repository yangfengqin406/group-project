import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import { weixinRoomChunks } from './scripts/weixin-room-chunks.mjs'
import { weixinStaticAssets } from './scripts/weixin-static-assets.mjs'
import { weixinScopeIds } from './scripts/weixin-scope-ids.mjs'
const uni = uniModule.default || uniModule
export default defineConfig({
  plugins: [uni(), weixinRoomChunks(), weixinStaticAssets(), weixinScopeIds()],
  server: { port: 5173, strictPort: true }
})
