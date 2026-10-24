<template>
  <view class="leisure-layer" aria-hidden="true">
    <view
      v-for="(stone, index) in stones"
      :key="index"
      class="stepping-stone"
      :style="{
        left: stone.x * 100 + '%',
        top: stone.y * 100 + '%',
        transform:
          'translate(-50%, -50%) rotate(' + ((index % 3) * 9 - 8) + 'deg)'
      }"
    ></view>
    <view class="pond-ripple ripple-one"></view>
    <view class="pond-ripple ripple-two"></view>
    <image
      class="fishing-deck"
      src="/static/plaza/fishing-dock.webp"
      mode="aspectFit"
    />
    <image
      class="rest-pavilion"
      src="/static/plaza/pavilion.webp"
      mode="aspectFit"
    />
  </view>
</template>

<script setup>
const stones = [
  { x: 0.333, y: 0.785 },
  { x: 0.319, y: 0.795 },
  { x: 0.305, y: 0.805 },
  { x: 0.291, y: 0.815 },
  { x: 0.278, y: 0.822 },
  { x: 0.265, y: 0.83 },
  { x: 0.252, y: 0.838 },
  { x: 0.238, y: 0.847 },
  { x: 0.225, y: 0.855 },
  { x: 0.437, y: 0.35 },
  { x: 0.446, y: 0.337 },
  { x: 0.456, y: 0.324 },
  { x: 0.469, y: 0.318 },
  { x: 0.482, y: 0.313 }
]
</script>

<style scoped>
.leisure-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.stepping-stone {
  position: absolute;
  width: 1.65%;
  height: 1.1%;
  border-radius: 24% 32% 20% 28%;
  background: #dfd3ae;
  box-shadow:
    inset 0 -1px 0 #aaa583,
    0 1px 0 #536c493b;
}
.pond-ripple {
  position: absolute;
  left: 13.5%;
  top: 88%;
  width: 4%;
  height: 1.2%;
  border-radius: 50%;
  border: 1px solid #d6eee6a3;
}
.ripple-two {
  left: 18%;
  top: 91%;
  width: 2.3%;
  height: 0.8%;
}
.fishing-deck {
  position: absolute;
  left: 16.5%;
  top: 82.7%;
  width: 11.6%;
  height: 6.4%;
}
.rest-pavilion {
  position: absolute;
  left: 40.5%;
  top: 11%;
  width: 16%;
  height: 20%;
}
</style>
