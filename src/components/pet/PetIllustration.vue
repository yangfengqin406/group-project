<template>
  <view
    v-if="frame"
    class="pet-illustration"
    :class="'tint-' + appearance.palette"
  >
    <view
      v-for="(region, index) in regions"
      :key="index"
      class="illustration-region"
      :style="regionStyle(region)"
    >
      <view class="region-copy" :style="copyStyle(region)">
        <view class="illustration-window" :style="windowStyle">
          <image
            class="illustration-sheet"
            :src="frame.source"
            :style="sheetStyle"
            mode="scaleToFill"
            @error="emit('error')"
          />
        </view>
      </view>
    </view>
    <view
      v-if="hideFeet && appearance.species === 'squirrel'"
      class="illustration-region"
      :style="regionStyle(tailTip)"
    >
      <view class="region-copy" :style="copyStyle(tailTip)">
        <view class="illustration-window" :style="windowStyle">
          <image
            class="illustration-sheet"
            src="/static/pets/tailored/squirrel-tails.webp"
            :style="sheetStyle"
            mode="scaleToFill"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  petIllustration,
  petIllustrationFilter
} from '../../utils/pet-illustrations.js'
import { originalFootWindows } from '../../utils/fitted-wearables.js'

const props = defineProps({
  appearance: { type: Object, required: true },
  view: { type: String, default: 'front' },
  hideFeet: { type: Boolean, default: false }
})
const emit = defineEmits(['error'])
const frame = computed(() =>
  petIllustration(
    props.appearance.species,
    props.appearance.feature,
    props.view
  )
)
const regions = computed(() =>
  props.hideFeet
    ? originalFootWindows(
        props.appearance.species,
        props.appearance.feature,
        props.view
      )
    : [{ x: 0, y: 0, width: 144, height: 176 }]
)
// 左脚与卷尾末端相邻；只从原尾透明拆层补回被脚裁窗碰到的小段。
const tailTip = { x: 57, y: 155, width: 13, height: 13 }
const regionStyle = (r) => ({
  left: `${(r.x / 144) * 100}%`,
  top: `${(r.y / 176) * 100}%`,
  width: `${(r.width / 144) * 100}%`,
  height: `${(r.height / 176) * 100}%`
})
const copyStyle = (r) => ({
  left: `${(-r.x / r.width) * 100}%`,
  top: `${(-r.y / r.height) * 100}%`,
  width: `${(144 / r.width) * 100}%`,
  height: `${(176 / r.height) * 100}%`
})
// 圆伞原图右侧有与主体分离的棕色碎片；收窄可视窗，保持原帧尺寸和定位。
const visibleWidth = computed(() =>
  props.appearance.species === 'mushroom' &&
  props.appearance.feature === 'round-cap'
    ? 0.896
    : 1
)
const windowStyle = computed(() => ({
  right: `${(1 - visibleWidth.value) * 100}%`
}))
const sheetStyle = computed(() => ({
  width: `${(frame.value.columns * 100) / visibleWidth.value}%`,
  height: `${frame.value.rows * 100}%`,
  left: `${(-frame.value.column * 100) / visibleWidth.value}%`,
  top: `${-frame.value.row * 100}%`,
  filter: petIllustrationFilter(props.appearance.palette)
}))
</script>

<style scoped>
.pet-illustration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.illustration-sheet {
  position: absolute;
  max-width: none;
  pointer-events: none;
}
.illustration-region {
  position: absolute;
  overflow: hidden;
}
.region-copy {
  position: absolute;
}
.illustration-window {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
}
</style>
