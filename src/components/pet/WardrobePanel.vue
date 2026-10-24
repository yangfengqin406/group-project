<template>
  <view class="wardrobe-panel">
    <view class="wardrobe-heading">
      <view><view class="wardrobe-title">我的衣柜</view></view>
      <view class="pearl-balance">
        <view class="pearl-icon"></view>
        {{ state?.pearls ?? '—' }} 珍珠
      </view>
    </view>
    <view class="wardrobe-preview">
      <view class="preview-ground"></view>
      <view class="wardrobe-model">
        <PetAvatar
          :appearance="appearance"
          :wardrobe="state?.equipped || {}"
          :view="view"
        />
      </view>
      <button
        class="turn-model"
        @tap="view = view === 'front' ? 'back' : 'front'"
      >
        {{ view === 'front' ? '看看背面' : '看看正面' }}
      </button>
      <view class="model-caption">
        {{ appearance?.name || '我的伙伴' }}的今日搭配
      </view>
    </view>
    <view class="wardrobe-intro">
      通关收集喜欢的装扮，不同部位可以一起穿戴。
    </view>
    <view v-if="error" class="wardrobe-error" role="alert">
      {{ error }}
      <button v-if="!state" @tap="refresh">重新打开</button>
    </view>
    <view v-if="state" class="adventure-goals">
      <view class="goal-heading">
        <view class="goal-title">潜水首通收藏</view>
        <text class="goal-progress">已通关 {{ clearedCount }}/3</text>
      </view>
      <view v-if="nextGoal" class="next-goal" :data-next-goal="nextGoal.level">
        <view class="next-goal-stage">
          <view class="next-goal-model">
            <PetAvatar
              :appearance="previewPet"
              :wardrobe="nextGoalWardrobe"
              :view="view"
            />
          </view>
          <text class="next-goal-tag">
            {{ nextGoalHasUnowned ? '未拥有装扮 · 仅预览' : '首通搭配 · 仅预览' }}
          </text>
        </view>
        <view class="next-goal-details">
          <text class="next-goal-title">下一站，第{{ levelLabels[nextGoal.level] }}关</text>
          <text class="next-goal-names">{{ nextGoal.names }}</text>
          <text class="goal-pearls">首次通关获得装扮和 {{ nextGoal.pearls }} 珍珠</text>
          <button
            class="adventure-action"
            :disabled="Boolean(busy)"
            @tap="adventure"
          >
            去潜水闯关
          </button>
        </view>
      </view>
      <view v-else class="goals-completed">
        <view>
          <view class="next-goal-title">三关首通收藏已完成</view>
          <view class="goal-pearls">重游攒珍珠，挑选更多喜欢的装扮。</view>
        </view>
        <button
          class="adventure-action"
          :disabled="Boolean(busy)"
          @tap="adventure"
        >
          重游攒珍珠
        </button>
      </view>
      <view
        v-for="goal in firstClearGoals"
        :key="goal.level"
        class="goal-row"
        :class="{ 'goal-cleared': hasCleared(goal.level) }"
        :data-goal="goal.level"
      >
        <text class="goal-level">第{{ levelLabels[goal.level] }}关</text>
        <view class="goal-rewards">
          <text>{{ goal.names }}</text>
          <text class="goal-pearls">首通另得 {{ goal.pearls }} 珍珠</text>
        </view>
        <text class="goal-state">
          {{
            hasCleared(goal.level)
              ? '已通关'
              : nextLevel === goal.level
                ? '下一站'
                : '待解锁'
          }}
        </text>
      </view>
    </view>
    <scroll-view scroll-x class="wardrobe-tabs">
      <view class="slot-row">
        <button
          v-for="slot in slots"
          :key="slot.id"
          :data-slot="slot.id"
          :class="{ selected: selected === slot.id }"
          :aria-pressed="selected === slot.id"
          @tap="selected = slot.id"
        >
          {{ slot.label }}
          <text>{{ ownedInSlot(slot.id) }}/{{ countInSlot(slot.id) }}</text>
        </button>
      </view>
    </scroll-view>
    <view v-if="!state && !error" class="wardrobe-loading">正在整理衣柜…</view>
    <view v-if="state" class="wardrobe-grid">
      <view
        v-for="item in visibleItems"
        :key="item.id"
        class="wardrobe-card"
        :class="{ 'is-worn': isWorn(item), 'is-locked': !isOwned(item.id) }"
        :data-item="item.id"
      >
        <view class="item-stage">
          <view class="item-model">
            <PetAvatar
              :appearance="previewPet"
              :wardrobe="{ [item.slot]: item.id }"
            />
          </view>
          <text class="item-tag">
            {{
              isWorn(item) ? '穿戴中' : isOwned(item.id) ? '已拥有' : '待收集'
            }}
          </text>
        </view>
        <text class="item-name">{{ item.name }}</text>
        <text class="item-description">{{ item.description }}</text>
        <text class="item-source">
          {{ item.source }}
          <text v-if="ownedCount(item.id) > 1">
            · {{ ownedCount(item.id) }} 件
          </text>
        </text>
        <text v-if="!isOwned(item.id)" class="item-cost">
          兑换需 {{ item.cost }} 珍珠
        </text>
        <button
          v-if="isOwned(item.id)"
          class="item-action"
          :class="{ 'remove-action': isWorn(item) }"
          :disabled="Boolean(busy)"
          @tap="equip(item)"
        >
          {{ busy === item.id ? '整理中…' : isWorn(item) ? '脱下' : '穿戴' }}
        </button>
        <button
          v-else-if="isLevelLocked(item)"
          class="item-action collect-action"
          :disabled="Boolean(busy)"
          @tap="adventure"
        >
          先通关第{{ levelLabels[item.unlockLevel] }}关
        </button>
        <button
          v-else-if="missingPearls(item) > 0"
          class="item-action collect-action"
          :disabled="Boolean(busy)"
          @tap="adventure"
        >
          还差 {{ missingPearls(item) }} 珍珠 · 去闯关
        </button>
        <button
          v-else
          class="item-action redeem-action"
          :disabled="Boolean(busy)"
          @tap="redeem(item)"
        >
          {{ busy === item.id ? '兑换中…' : item.cost + ' 珍珠兑换' }}
        </button>
      </view>
    </view>
    <view class="wardrobe-hint">
      首通收好固定装扮，重游攒珍珠。更多服饰通关后开放兑换；三种池塘小饰品也可钓鱼收集。
      {{
        config.apiMode === 'mock'
          ? '装扮按当前演示身份保存在本机。'
          : '装扮由当前账号服务读取和保存，失败时请重试。'
      }}
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { wardrobe } from '../../services/index.js'
import { config } from '../../config/index.js'
import { WARDROBE_SLOTS, WARDROBE_ITEMS } from '../../utils/wardrobe-catalog.js'
import { errorText } from '../../utils/errors.js'
import PetAvatar from './PetAvatar.vue'
const props = defineProps({ appearance: { type: Object, default: null } })
const emit = defineEmits(['change', 'adventure'])
const slots = WARDROBE_SLOTS
const levelLabels = ['', '一', '二', '三']
const firstClearRules = [
  { level: 1, items: ['sailor-shirt', 'shell-shoes'], pearls: 30 },
  { level: 2, items: ['cloud-bun', 'shell-pouch'], pearls: 45 },
  { level: 3, items: ['shell-crown', 'star-wand', 'pearl-badge'], pearls: 60 }
]
const state = ref(null),
  selected = ref('head'),
  view = ref('front'),
  busy = ref(''),
  error = ref('')
let revision = 0,
  mounted = true
const items = computed(() => state.value?.catalog || WARDROBE_ITEMS)
const firstClearGoals = computed(() =>
  firstClearRules.map((goal) => ({
    ...goal,
    names: goal.items
      .map((id) => items.value.find((item) => item.id === id)?.name || id)
      .join('、')
  }))
)
const visibleItems = computed(() =>
  items.value.filter((item) => item.slot === selected.value)
)
const previewPet = computed(() => ({ ...props.appearance, accessory: 'none' }))
const ownedCount = (id) =>
  state.value?.owned?.find((item) => item.id === id)?.count || 0
const isOwned = (id) => ownedCount(id) > 0
const isWorn = (item) => state.value?.equipped?.[item.slot] === item.id
const hasCleared = (level) =>
  state.value?.clearedLevels?.includes(level) || false
const clearedCount = computed(
  () => firstClearRules.filter((goal) => hasCleared(goal.level)).length
)
const nextLevel = computed(
  () => firstClearRules.find((goal) => !hasCleared(goal.level))?.level || null
)
const nextGoal = computed(() =>
  firstClearGoals.value.find((goal) => goal.level === nextLevel.value)
)
const nextGoalWardrobe = computed(() => {
  const equipped = { ...state.value?.equipped }
  for (const id of nextGoal.value?.items || []) {
    const item = items.value.find((entry) => entry.id === id)
    if (item) equipped[item.slot] = item.id
  }
  return equipped
})
const nextGoalHasUnowned = computed(() =>
  nextGoal.value?.items.some((id) => !isOwned(id)) || false
)
const isLevelLocked = (item) =>
  item.unlockLevel > 0 && !hasCleared(item.unlockLevel)
const missingPearls = (item) =>
  Math.max(0, item.cost - (state.value?.pearls || 0))
const countInSlot = (slot) =>
  items.value.filter((item) => item.slot === slot).length
const ownedInSlot = (slot) =>
  items.value.filter((item) => item.slot === slot && isOwned(item.id)).length
async function request(id, action) {
  if (busy.value || !mounted) return
  const current = ++revision
  busy.value = id
  error.value = ''
  try {
    const next = await action()
    if (!mounted || current !== revision) return
    state.value = next
    emit('change', next)
  } catch (failure) {
    if (mounted && current === revision) error.value = errorText(failure)
  } finally {
    if (current === revision) busy.value = ''
  }
}
function refresh() {
  return request('loading', () => wardrobe.getState())
}
function equip(item) {
  return request(item.id, () =>
    wardrobe.equip({ slot: item.slot, itemId: isWorn(item) ? null : item.id })
  )
}
function redeem(item) {
  if (!state.value || isLevelLocked(item) || missingPearls(item) > 0) return
  return request(item.id, () => wardrobe.redeem({ itemId: item.id }))
}
function adventure() {
  if (state.value && !busy.value && mounted) emit('adventure')
}
onMounted(refresh)
onUnmounted(() => {
  mounted = false
  revision++
})
</script>

<style scoped>
.wardrobe-panel {
  color: #36534b;
  padding-bottom: 12px;
}
.wardrobe-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.wardrobe-kicker {
  font-size: 9px;
  letter-spacing: 2px;
  color: #9d9879;
}
.wardrobe-title {
  font-size: 24px;
  font-weight: 650;
  margin-top: 3px;
}
.pearl-balance {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  padding: 8px 12px;
  border: 1px solid #e2d8b8;
  border-radius: 30px;
  background: #fffdf1;
}
.pearl-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid #c8bda2;
  background: radial-gradient(circle at 30% 25%, #fffdf2, #ded3ba 80%);
  box-shadow: 1px 2px 0 #c8bda233;
}
.wardrobe-preview {
  height: 195px;
  position: relative;
  margin: 16px 0 10px;
  border-radius: 80px 80px 16px 16px;
  background: radial-gradient(
    ellipse at 50% 75%,
    #dce5c5,
    #edf0db 68%,
    #f7f3e100 69%
  );
}
.wardrobe-model {
  position: absolute;
  left: calc(50% - 70px);
  top: 5px;
  width: 140px;
  height: 155px;
}
.preview-ground {
  position: absolute;
  left: calc(50% - 80px);
  bottom: 31px;
  width: 160px;
  height: 18px;
  background: #c1cca555;
  border-radius: 50%;
}
.model-caption {
  position: absolute;
  bottom: 5px;
  width: 100%;
  font-size: 12px;
  text-align: center;
  color: #7d8469;
}
.turn-model {
  position: absolute;
  right: 10px;
  top: 12px;
  border: 1px solid #d4ddc1;
  background: #fffdf0;
  color: #6b7e64;
  font-size: 11px;
  min-height: 38px;
  line-height: 38px;
  padding: 0 10px;
}
.wardrobe-intro,
.wardrobe-hint {
  font-size: 12px;
  line-height: 1.8;
  color: #85896e;
}
.wardrobe-intro {
  padding: 10px 0 16px;
}
.adventure-goals {
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #dce3cb;
  border-radius: 12px;
  background: #f0f2e2;
}
.goal-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.goal-title {
  font-size: 14px;
  font-weight: 600;
}
.goal-progress {
  color: #7d896e;
  font-size: 10px;
}
.next-goal {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 10px 0 12px;
}
.next-goal-stage {
  flex: 0 0 132px;
  height: 150px;
  position: relative;
  border-radius: 50% 50% 12px 12px;
  background: #e3e9d3;
}
.next-goal-model {
  position: absolute;
  top: 4px;
  left: calc(50% - 54px);
  width: 108px;
  height: 122px;
}
.next-goal-tag {
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  font-size: 10px;
  text-align: center;
  color: #65785b;
}
.next-goal-details {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.next-goal-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}
.next-goal-names {
  font-size: 12px;
  line-height: 1.7;
  color: #66785d;
}
.goals-completed {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  line-height: 1.7;
}
.goals-completed > view {
  flex: 1;
}
.adventure-action {
  min-height: 36px;
  padding: 8px 10px;
  margin: 2px 0 0;
  line-height: 1.4;
  border-radius: 8px;
  background: #d8e7d5;
  color: #42684f;
  font-size: 11px;
}
.goal-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid #dfe5cf;
}
.goal-level {
  flex-shrink: 0;
  font-size: 11px;
  color: #687c62;
}
.goal-rewards {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  line-height: 1.5;
  font-size: 11px;
}
.goal-pearls {
  color: #989278;
  font-size: 10px;
}
.goal-state {
  flex-shrink: 0;
  color: #8b957e;
  font-size: 10px;
}
.goal-cleared .goal-state {
  color: #517c65;
}
.wardrobe-tabs {
  width: 100%;
  border-top: 1px solid #e0e1ca;
  border-bottom: 1px solid #e0e1ca;
}
.slot-row {
  display: flex;
  width: max-content;
  min-width: 100%;
  gap: 4px;
  padding: 8px 0;
}
.slot-row button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 62px;
  min-height: 51px;
  padding: 6px 12px;
  line-height: 1.3;
  font-size: 13px;
  border-radius: 9px;
  color: #7d8469;
  background: transparent;
}
.slot-row button text {
  font-size: 9px;
  opacity: 0.7;
}
.slot-row button.selected {
  color: #355a50;
  background: #dce9da;
}
.wardrobe-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}
.wardrobe-card {
  min-width: 0;
  padding: 10px;
  background: #fffdf3;
  border: 1px solid #e1e2cd;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.wardrobe-card.is-worn {
  border: 1px solid #87a68a;
  box-shadow: 0 0 0 2px #87a68a22;
}
.item-stage {
  height: 115px;
  position: relative;
  background: #eef0df;
  border-radius: 10px;
  overflow: hidden;
}
.item-model {
  position: absolute;
  left: calc(50% - 44px);
  top: 6px;
  width: 88px;
  height: 96px;
}
.item-tag {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 3px 5px;
  font-size: 9px;
  color: #6d8265;
  background: #fffdf1d9;
  border-radius: 5px;
}
.is-worn .item-tag {
  background: #517c65;
  color: #fffbed;
}
.item-name {
  font-size: 14px;
  font-weight: 600;
  margin-top: 5px;
}
.item-description {
  font-size: 11px;
  line-height: 1.7;
  color: #8e927c;
  min-height: 37px;
}
.item-source {
  font-size: 9px;
  line-height: 1.6;
  color: #9c987c;
  margin-top: auto;
}
.item-cost {
  font-size: 10px;
  line-height: 1.6;
  color: #89784f;
}
.item-action {
  font-size: 12px;
  line-height: 1.4;
  min-height: 40px;
  margin-top: 8px;
  padding: 10px 4px;
  color: #fffceb;
  background: #557e68;
  border-radius: 8px;
}
.remove-action {
  background: #e4ead7;
  color: #6c7f62;
}
.redeem-action {
  background: #ecdfbf;
  color: #89784f;
}
.collect-action {
  background: #e5ebd9;
  color: #60774f;
}
.adventure-action[disabled],
.item-action[disabled] {
  background: #eeeadd;
  color: #aba791;
  opacity: 1;
}
.wardrobe-hint {
  border-top: 1px dashed #dcdcc2;
  padding-top: 14px;
}
.wardrobe-error {
  color: #9b6455;
  background: #f2e4d4;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
}
.wardrobe-loading {
  padding: 25px;
  color: #8e927c;
  font-size: 13px;
}
button::after {
  border: 0;
}
button:focus-visible {
  outline: 2px solid #456957;
  outline-offset: 2px;
}
@media (max-width: 480px) {
  .goal-heading {
    column-gap: 6px;
  }
  .adventure-goals {
    padding: 10px;
  }
  .next-goal {
    gap: 10px;
  }
  .next-goal-stage {
    flex-basis: 114px;
    height: 144px;
  }
  .next-goal-title {
    font-size: 13px;
  }
  .goal-row {
    gap: 7px;
  }
  .wardrobe-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  .wardrobe-card {
    padding: 8px;
  }
  .slot-row button {
    min-width: 56px;
    padding: 6px 10px;
  }
  .wardrobe-title {
    font-size: 22px;
  }
  .wardrobe-model {
    width: 126px;
    height: 145px;
    left: calc(50% - 63px);
  }
  .wardrobe-preview {
    height: 180px;
  }
  .item-description {
    min-height: 38px;
  }
}
</style>
