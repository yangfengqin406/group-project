<script>
import { watch } from 'vue'
import { restoreIdentity } from './services/transport.js'
import { soundscape } from './services/soundscape.js'
import { session } from './utils/session.js'
import { messageAlerts } from './services/message-alerts.js'
// #ifdef APP-PLUS
import { appSystemPushEnabled } from './platform/app-build-capabilities.js'
import { systemPush } from './services/system-push.js'
// #endif

let foreground = false
function resume() {
  // #ifdef H5
  if (globalThis.document?.hidden) return
  // #endif
  if (foreground) messageAlerts.start()
}
export default {
  onLaunch() {
    // #ifdef APP-PLUS
    if (appSystemPushEnabled) {
      systemPush.start()
      watch(() => session.user, () => { void systemPush.changed() })
    }
    // #endif
    watch(() => session.user?.id, () => { messageAlerts.reset(); resume() })
    restoreIdentity().catch(() => {})
    // #ifdef H5
    globalThis.document.addEventListener('visibilitychange', () => {
      if (globalThis.document.hidden) {
        messageAlerts.stop()
        soundscape.setVisible(false)
      } else resume()
    })
    // #endif
  },
  onShow() {
    foreground = true; resume()
    // #ifdef APP-PLUS
    if (appSystemPushEnabled) void systemPush.resume()
    // #endif
  },
  onHide() {
    foreground = false
    messageAlerts.stop()
    soundscape.setVisible(false)
  }
}
</script>
<style lang="scss">
@import './styles/theme.scss';
</style>
