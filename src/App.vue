<script>
import { restoreIdentity } from './services/transport.js'
export default { onLaunch() { restoreIdentity().catch(() => {}) } }
</script>
<style lang="scss">
@import './styles/theme.scss';
</style>
