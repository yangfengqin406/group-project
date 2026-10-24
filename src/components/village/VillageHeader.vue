<template>
  <view class="village-header" :class="[`room-${roomKind}`, { compact }]">
    <view class="room-picture" aria-hidden="true">
      <view class="room-window"><view /><view /><view /><view /></view>
      <view class="room-shelf"><view /><view /></view>
      <image
        class="room-atlas"
        :class="{ ready: illustrationReady }"
        :style="atlasPosition"
        src="/static/village/room-interiors.webp"
        mode="scaleToFill"
        @load="illustrationReady = true"
        @error="illustrationReady = false"
      />
    </view>
    <view class="room-caption">
      <view class="room-nameplate"><view class="room-mark" /><text>{{ title }}</text></view>
      <view v-if="subtitle" class="room-description">{{ subtitle }}</view>
    </view>
    <view v-if="$slots.default" class="room-action"><slot /></view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
const props = defineProps({
  kind: { type: String, default: 'home' },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})
const illustrationReady = ref(false)
const roomKind = computed(() =>
  props.kind === 'plan' || props.kind === 'help'
    ? 'partner'
    : props.kind === 'lost_found'
      ? 'lost'
      : props.kind
)
const atlasPosition = computed(() => ({
  left: ['lost', 'home'].includes(roomKind.value) ? '-100%' : '0',
  top: ['market', 'home'].includes(roomKind.value) ? '-100%' : '0'
}))
</script>

<style scoped>
.village-header {
  position: relative;
  min-height: 200px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 22px;
  border: 1px solid #d8c4a0;
  border-bottom: 5px solid #976e45;
  border-radius: 12px 12px 3px 3px;
  background: #ece2c9;
  isolation: isolate;
}
.room-picture {
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: auto;
  aspect-ratio: 2;
  transform: translateY(-50%);
  overflow: hidden;
  background: #e4dfca;
  z-index: 0;
}
.room-atlas {
  position: absolute;
  width: 200%;
  height: 200%;
  opacity: 0;
}
.room-atlas.ready { opacity: 1; }
.room-window {
  position: absolute;
  top: 22px;
  right: 72px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  width: 88px;
  height: 94px;
  padding: 5px;
  border: 5px solid #976e45;
  border-radius: 38px 38px 2px 2px;
  background: #976e45;
}
.room-window view { background: #cad5b0; }
.room-window view:first-child { border-radius: 25px 0 0 0; }
.room-window view:nth-child(2) { border-radius: 0 25px 0 0; }
.room-shelf {
  position: absolute;
  right: 18px;
  bottom: 18px;
  width: 270px;
  height: 8px;
  border-radius: 2px;
  background: #976e45;
}
.room-shelf view:first-child {
  position: absolute;
  bottom: 8px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 5px 5px 12px 12px;
  border: 3px solid #b9784e;
  background: #d0ac7a;
}
.room-shelf view:last-child {
  position: absolute;
  bottom: 32px;
  right: 4px;
  width: 48px;
  height: 32px;
  border-radius: 50%;
  background: #6e9b80;
}
.room-caption {
  position: relative;
  z-index: 1;
  max-width: 74%;
  padding: 13px 16px;
  border: 1px solid #d9cba9;
  border-radius: 3px 3px 9px 3px;
  background: #fff7de;
  box-shadow: 2px 3px 0 #976e4526;
}
.room-nameplate {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #3e654f;
  font-family: 'STKaiti', 'KaiTi', 'Noto Serif CJK SC', serif;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
}
.room-mark {
  flex: none;
  width: 11px;
  height: 16px;
  border-radius: 9px 1px 9px 1px;
  background: var(--room-accent, #6e9b80);
  transform: rotate(-24deg);
}
.room-description {
  margin-top: 6px;
  color: #6b705e;
  font-size: 13px;
  line-height: 1.6;
}
.room-action { position: relative; z-index: 1; margin-left: auto; flex: none; }
.compact { min-height: 150px; padding: 16px 20px; }
.compact .room-nameplate { font-size: 24px; }
@media (max-width: 520px) {
  .village-header { min-height: 180px; padding: 14px; gap: 8px; }
  .room-caption { max-width: 77%; padding: 10px 12px; }
  .room-nameplate { gap: 6px; font-size: 24px; }
  .room-description { font-size: 12px; max-width: 230px; }
  .compact { min-height: 120px; padding: 12px; }
  .compact .room-caption { max-width: calc(100% - 70px); padding: 8px 10px; }
  .compact .room-nameplate { font-size: 21px; }
  .compact .room-description { margin-top: 4px; font-size: 11px; line-height: 1.5; }
}
</style>
