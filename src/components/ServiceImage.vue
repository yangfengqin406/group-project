<template>
  <image :src="displaySrc" :mode="mode" :lazy-load="lazyLoad" @error="emit('error', $event)" @load="emit('load', $event)" />
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { resolveImage } from '../services/media.js'
import { session } from '../utils/session.js'
defineOptions({ options: { virtualHost: true } })
const props = defineProps({
  src: { type: String, default: '' },
  mode: { type: String, default: 'scaleToFill' },
  lazyLoad: { type: Boolean, default: false }
})
const emit = defineEmits(['error', 'load'])
const displaySrc = ref('')
let revision = 0, release = () => {}
watch([() => props.src, () => session.user?.id], async ([src]) => {
  const version = ++revision
  release(); release = () => {}; displaySrc.value = ''
  if (!src) return
  try {
    const result = await resolveImage(src)
    if (version !== revision) { result.release(); return }
    release = result.release
    displaySrc.value = result.src
  } catch (error) { if (version === revision && error.code !== 'CONFLICT') emit('error', error) }
}, { immediate: true })
onBeforeUnmount(() => { revision++; release() })
</script>
