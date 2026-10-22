<template>
  <view class="plaza-guide">
    <view class="guide-welcome">
      <image src="/static/village/guide-puppy.webp" mode="aspectFit" />
      <view>
        <view class="guide-title">我是麦麦，欢迎做邻居</view>
        <view class="guide-subtitle">想做什么？我来给你指路。</view>
      </view>
    </view>
    <view class="guide-topics">
      <button v-for="item in topics" :key="item.id" :class="['guide-topic', { selected: current.id === item.id }]" :aria-pressed="current.id === item.id" @tap="selected = item.id">
        <view class="topic-dot" :style="{ background: item.color }" />
        <text>{{ item.title }}</text>
      </button>
    </view>
    <view class="guide-paper" role="status">
      <view class="paper-title">{{ current.title }}</view>
      <view class="paper-body">{{ current.body }}</view>
      <button v-if="current.id !== 'walk'" class="guide-go" @tap="$emit('go', current.id)">让伙伴带路 ›</button>
      <view v-else class="walk-note">点小动物可以聊天；点公告栏，随时都能找到我。</view>
    </view>
    <view class="guide-footnote">麦麦和散步的小动物是广场向导，不代表在线同学。</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
defineEmits(['go'])
const selected = ref('walk')
const topics = [
  { id: 'walk', title: '在小镇散步', color: '#739b7b', body: '点一下步道，伙伴就会沿路走过去。点房子或门牌，走到门口后会进屋。按住空地拖动，可以看看广场另一边；右下角“广场地图”能看全景。' },
  { id: 'partner', title: '约个搭子', color: '#927ab1', body: '紫色屋顶的小屋里，可以发布自己的计划、按类别与时间找搭子，也可以提出技能求助。进入计划详情，看看推荐和邀请。' },
  { id: 'lost', title: '寻找失物', color: '#bd8056', body: '橙色屋顶是失物招领。丢失或拾获物品都能带着照片发布，按卡片、钥匙和杂物查找；联系和留言都从原来的发布进入。' },
  { id: 'market', title: '逛二手集市', color: '#b99557', body: '条纹棚子下可以发布闲置或求购物品。看清价格、说明和交接校区，在详情里联系同学；私信统一在右下角查看。' },
  { id: 'home', title: '回自己的家', color: '#6d997d', body: '绿色屋顶的小屋是自己的家。在这里整理资料和自己的发布，也能给宠物换形象、打开衣柜。' },
  { id: 'pond', title: '去池边玩', color: '#609995', body: '沿下方石板路去池边，试着钓鱼，或到水下闯关。装扮需要收集或通关解锁；四人休息亭的真人匹配和牌局暂未开放。' }
]
const current = computed(() => topics.find((item) => item.id === selected.value) || topics[0])
</script>

<style scoped>
.plaza-guide { padding: 12px 16px 18px; color: #435b43; }
.guide-welcome { display: flex; align-items: center; gap: 15px; padding: 8px 0 18px; }
.guide-welcome image { flex: none; width: 85px; height: 100px; }
.guide-title { font-family: 'STKaiti', 'KaiTi', serif; font-size: 22px; font-weight: 700; line-height: 1.5; }
.guide-subtitle { margin-top: 6px; color: #7b8068; font-size: 13px; }
.guide-topics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; padding-bottom: 18px; }
.guide-topic { display: flex; align-items: center; gap: 9px; min-height: 46px; margin: 0; padding: 8px 9px; border-bottom: 1px solid #dfd5b9; border-radius: 0; background: transparent; color: #65715b; line-height: 1.5; font-size: 14px; text-align: left; }
.guide-topic::after, .guide-go::after { border: 0; }
.guide-topic.selected { color: #304c39; background: #e8ecd9; }
.topic-dot { flex: none; width: 9px; height: 12px; border-radius: 8px 1px; transform: rotate(-20deg); }
.guide-paper { padding: 18px 20px; border: 1px solid #dfceaa; border-radius: 3px 3px 10px 3px; background: #fffdf2; }
.paper-title { font-size: 18px; font-weight: 600; }
.paper-body { margin-top: 9px; font-size: 14px; line-height: 1.9; }
.guide-go { min-height: 44px; margin: 12px 0 0; padding: 10px 14px; color: #fff8e7; background: #496c54; font-size: 14px; line-height: 1.5; border-radius: 6px; }
.walk-note, .guide-footnote { font-size: 12px; line-height: 1.7; color: #86856e; margin-top: 14px; }
button:focus-visible { outline: 2px solid #496c54; outline-offset: 2px; }
@media (max-width: 390px) { .guide-title { font-size: 19px; } .guide-welcome { gap: 10px; } .guide-welcome image { width: 67px; height: 82px; } .guide-paper { padding: 15px; } }
</style>
