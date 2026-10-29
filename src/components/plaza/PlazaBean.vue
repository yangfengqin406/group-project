<template>
  <view
    class="plaza-bean wx-v"
    :class="['skin-' + skin, { 'is-walking': walking }]"
    :style="{ transform: 'scaleX(' + facing + ')' }"
    aria-hidden="true"
  >
    <view class="bean-shadow wx-v"></view>
    <view class="bean-foot foot-left wx-v"></view>
    <view class="bean-foot foot-right wx-v"></view>
    <view class="bean-body wx-v">
      <view class="bean-eye eye-left wx-v"></view>
      <view class="bean-eye eye-right wx-v"></view>
      <view class="bean-blush blush-left wx-v"></view>
      <view class="bean-blush blush-right wx-v"></view>
      <view class="bean-mouth wx-v"></view>
    </view>
    <view class="bean-arm arm-left wx-v"></view>
    <view class="bean-arm arm-right wx-v"></view>
    <view class="bean-accessory wx-v"></view>
  </view>
</template>
<script setup>
defineProps({
  skin: { type: String, default: 'sprout' },
  walking: { type: Boolean, default: false },
  facing: { type: Number, default: 1 }
})
</script>
<style scoped>
.plaza-bean {
  position: relative;
  width: 100%;
  height: 100%;
  --bean: #f7f2c8;
  --bean-shade: #e2daa2;
  --bean-line: #6b764e;
}
.bean-shadow {
  position: absolute;
  left: 10%;
  bottom: 0;
  width: 80%;
  height: 16%;
  border-radius: 50%;
  background: #37543135;
}
.bean-body {
  position: absolute;
  left: 11%;
  top: 17%;
  width: 78%;
  height: 68%;
  border: 2rpx solid var(--bean-line);
  border-radius: 49% 49% 45% 45%;
  background: var(--bean);
  box-shadow: inset -5rpx -6rpx 0 var(--bean-shade);
}
.bean-body::before {
  content: '';
  position: absolute;
  left: 16%;
  top: 10%;
  width: 30%;
  height: 18%;
  background: #ffffff66;
  border-radius: 50%;
  transform: rotate(-25deg);
}
.bean-eye {
  position: absolute;
  top: 39%;
  width: 9%;
  height: 13%;
  background: #504c42;
  border-radius: 50%;
}
.eye-left {
  left: 23%;
}
.eye-right {
  right: 23%;
}
.bean-blush {
  position: absolute;
  top: 56%;
  width: 16%;
  height: 8%;
  border-radius: 50%;
  background: #e9aaa799;
}
.blush-left {
  left: 9%;
}
.blush-right {
  right: 11%;
}
.bean-mouth {
  position: absolute;
  left: 41%;
  top: 56%;
  width: 13%;
  height: 9%;
  border-bottom: 2rpx solid #655447;
  border-radius: 0 0 50% 50%;
}
.bean-arm {
  position: absolute;
  top: 52%;
  width: 18%;
  height: 22%;
  border: 2rpx solid var(--bean-line);
  background: var(--bean);
  border-radius: 60%;
  transform-origin: 50% 15%;
}
.arm-left {
  left: 1%;
  transform: rotate(12deg);
}
.arm-right {
  right: 1%;
  transform: rotate(-12deg);
}
.bean-foot {
  position: absolute;
  bottom: 7%;
  width: 22%;
  height: 14%;
  border: 2rpx solid var(--bean-line);
  background: var(--bean-shade);
  border-radius: 45%;
}
.foot-left {
  left: 22%;
}
.foot-right {
  right: 18%;
}
.bean-accessory {
  position: absolute;
  left: 49%;
  top: 3%;
  width: 24%;
  height: 19%;
  border: 2rpx solid #638954;
  background: #80b479;
  border-radius: 80% 10% 75% 10%;
  transform: rotate(-10deg);
}
.skin-sprout .bean-accessory::before {
  content: '';
  position: absolute;
  left: -80%;
  top: 12%;
  width: 80%;
  height: 65%;
  border: 2rpx solid #638954;
  background: #9ac789;
  border-radius: 15% 90% 15% 90%;
}
.skin-peach {
  --bean: #f8c8b5;
  --bean-shade: #e9ac95;
  --bean-line: #9b6b5d;
}
.skin-peach .bean-accessory {
  left: 15%;
  top: 10%;
  width: 22%;
  height: 19%;
  background: var(--bean);
  border-color: var(--bean-line);
  border-radius: 50%;
}
.skin-peach .bean-accessory::after {
  content: '';
  position: absolute;
  left: 230%;
  top: -10%;
  width: 100%;
  height: 100%;
  background: var(--bean);
  border: 2rpx solid var(--bean-line);
  border-radius: 50%;
}
.skin-purple {
  --bean: #decdf8;
  --bean-shade: #bba9de;
  --bean-line: #807398;
}
.skin-purple .bean-accessory {
  left: 16%;
  top: 10%;
  width: 65%;
  height: 18%;
  background: #aa93cc;
  border-color: #807398;
  border-radius: 70% 40% 40% 50%;
}
.skin-mint {
  --bean: #c5e2d1;
  --bean-shade: #9ebfaa;
  --bean-line: #708f7a;
}
.skin-mint .bean-accessory {
  left: 12%;
  top: 38%;
  width: 23%;
  height: 31%;
  background: #8caa9b;
  border-color: #708f7a;
  border-radius: 35%;
}
.is-walking .bean-body {
  animation: bean-bounce 0.38s ease-in-out infinite alternate;
}
.is-walking .foot-left,
.is-walking .arm-right {
  animation: bean-step 0.38s ease-in-out infinite alternate;
}
.is-walking .foot-right,
.is-walking .arm-left {
  animation: bean-step 0.38s ease-in-out infinite alternate-reverse;
}
@keyframes bean-bounce {
  to {
    transform: translateY(-3rpx);
  }
}
@keyframes bean-step {
  to {
    transform: rotate(-18deg) translateY(-2rpx);
  }
}
@media (prefers-reduced-motion: reduce) {
  .plaza-bean .wx-v {
    animation: none !important;
  }
}
</style>
