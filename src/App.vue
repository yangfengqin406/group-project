<script>
import { restoreIdentity } from './services/transport.js'
import { soundscape } from './services/soundscape.js'
export default {
  onLaunch() { restoreIdentity().catch(() => {}) },
  onHide() { soundscape.setVisible(false) }
}
</script>
<style lang="scss">
@import './styles/theme.scss';
</style>
