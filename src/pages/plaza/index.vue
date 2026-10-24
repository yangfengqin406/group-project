<template>
  <view class="plaza-page">
    <PlazaScene
      ref="scene"
      :active="active && !boardOpen && !pondOpen && !pavilionOpen && !diveOpen"
      :appearance="appearance"
      :wardrobe="wardrobeState?.equipped"
      :preparing="petLoading"
      :overview="overview"
      @enter="enter"
      @board="openBoard"
      @guide="openGuide"
      @pond="openPond"
      @pavilion="openPavilion"
    />
    <view class="game-top">
      <button
        class="pet-pass"
        aria-label="我的宠物"
        :disabled="navigating"
        @tap="openPet"
      >
        <view class="pass-avatar">
          <PetAvatar
            v-if="appearance"
            :appearance="appearance"
            :wardrobe="wardrobeState?.equipped"
          />
        </view>
        <view class="pass-copy">
          <text class="pass-name">{{ appearance?.name || '我的伙伴' }}</text>
          <text class="pass-label">我的宠物</text>
        </view>
      </button>
      <button class="activity-banner" @tap="openBoard">
        <view class="banner-pin"></view>
        <text class="banner-title">校园活动</text>
        <text class="banner-caption">最近有什么好玩的？</text>
      </button>
      <view class="destination-actions">
        <button
          class="hud-button area-action"
          :disabled="!appearance"
          @tap="walkToArea('pond')"
        >
          <view class="pond-symbol"></view>
          <text>池边</text>
        </button>
        <button
          class="hud-button area-action"
          :disabled="!appearance"
          @tap="walkToArea('pavilion')"
        >
          <view class="pavilion-symbol"></view>
          <text>亭子</text>
        </button>
      </view>
    </view>
    <view
      v-if="petLoading || petError || ornamentError || navigationError"
      class="game-status"
      role="status"
    >
      <text>
        {{ navigationError || petError || ornamentError || '正在读取伙伴…' }}
      </text>
      <button
        v-if="petError || ornamentError"
        class="status-retry"
        @tap="petError ? loadPet() : loadOrnament()"
      >
        重试
      </button>
    </view>
    <view
      v-if="welcomeVisible && active && appearance && !boardOpen && !pondOpen && !pavilionOpen && !diveOpen"
      class="first-visit-note"
    >
      <button
        class="welcome-guide"
        aria-label="打开麦麦的广场指南"
        @tap="openGuide"
      >
        <text>点步道散步，点房子进小屋。</text>
        <text class="welcome-detail">问问麦麦，或用地图看全景</text>
      </button>
      <button
        class="welcome-dismiss"
        aria-label="收起新手提示"
        @tap="dismissWelcome"
      >
        ×
      </button>
    </view>
    <view class="game-bottom">
      <text v-if="config.apiMode === 'mock'" class="demo-mark">
        本机演示 · 数据不跨设备同步
      </text>
      <view class="game-actions">
        <button
          class="hud-button"
          :aria-pressed="overview"
          @tap="toggleOverview"
        >
          <text class="hud-icon">⌖</text>
          <text>{{ overview ? '回到身边' : '广场地图' }}</text>
        </button>
        <button class="hud-button" @tap="goMessages">
          <text class="hud-icon">✉</text>
          <text>私信</text>
        </button>
        <button class="hud-button" @tap="goHome">
          <image class="home-icon" src="/static/tabs/home-active.png" />
          <text>我的</text>
        </button>
      </view>
    </view>
    <view v-if="boardOpen" class="board-shade" @tap="closeBoard">
      <view
        class="bulletin-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="boardTab === 'guide' ? '麦麦的广场指南' : '校园活动公告'"
        @tap.stop
      >
        <view class="bulletin-heading">
          <view>
            <view class="bulletin-title">{{ boardTab === 'guide' ? '麦麦的广场指南' : '校园活动公告' }}</view>
            <text class="bulletin-subtitle">
              {{ boardTab === 'guide' ? '初来小镇，慢慢认识每个地方' : '找一件喜欢的事，和同学一起参加' }}
            </text>
          </view>
          <button class="board-close" aria-label="关闭公告栏" @tap="closeBoard">
            ×
          </button>
        </view>
        <view class="board-tabs">
          <button :class="{ selected: boardTab === 'activities' }" :aria-pressed="boardTab === 'activities'" @tap="showActivities">校园活动</button>
          <button :class="{ selected: boardTab === 'guide' }" :aria-pressed="boardTab === 'guide'" @tap="boardTab = 'guide'">麦麦的广场指南</button>
        </view>
        <scroll-view class="bulletin-content" scroll-y>
          <PlazaGuide v-if="boardTab === 'guide'" @go="guideWalk" />
          <template v-else>
          <view v-if="boardLoading" class="bulletin-state">
            正在看看近期活动…
          </view>
          <view
            v-else-if="boardError"
            class="bulletin-state error"
            role="alert"
          >
            {{ boardError }}
            <button class="secondary" @tap="loadBoard()">重新读取</button>
          </view>
          <view v-else-if="!announcements.length" class="bulletin-state">
            暂时没有可参加的活动，过段时间再来看看。
          </view>
          <view
            v-for="item in announcements"
            :key="item.id"
            class="bulletin-note"
          >
            <view class="activity-note-head">
              <view v-if="item.startAt" class="activity-date">
                <text>{{ activityDay(item.startAt).month }}月</text>
                <text class="date-day">
                  {{ activityDay(item.startAt).day }}
                </text>
              </view>
              <view>
                <text v-if="item.demo" class="demo-tag">
                  演示活动 · 非真实报名
                </text>
                <view class="note-title">{{ item.title }}</view>
              </view>
            </view>
            <view class="note-body">{{ item.body }}</view>
            <view v-if="item.startAt" class="activity-facts">
              <view>
                {{ formatTime(item.startAt) }} — {{ formatTime(item.endAt) }}
              </view>
              <view>地点：{{ item.location }}</view>
              <view>组织方：{{ item.organizer }}</view>
            </view>
            <view v-if="item.participation" class="participation-note">
              {{ item.participation }}
            </view>
          </view>
          <button
            v-if="nextCursor && !boardError"
            class="more-notices"
            :disabled="boardLoading"
            @tap="loadBoard(true)"
          >
            更多活动
          </button>
          </template>
        </scroll-view>
        <button class="mail-link" @tap="goMessages">
          <text>想找同学聊聊？</text>
          <text>查看私信 ›</text>
        </button>
      </view>
    </view>
    <view v-if="pavilionOpen" class="board-shade" @tap="pavilionOpen = false">
      <view
        class="pavilion-panel"
        role="dialog"
        aria-modal="true"
        aria-label="四人休息亭"
        @tap.stop
      >
        <button
          class="board-close pavilion-close"
          aria-label="离开休息亭"
          @tap="pavilionOpen = false"
        >
          ×
        </button>
        <text class="pavilion-kicker">走累了，就坐一会儿</text>
        <view class="bulletin-title">四人休息亭</view>
        <view class="pavilion-table-scene">
          <view class="pavilion-table">闲来一局</view>
          <view
            v-for="seat in [1, 2, 3, 4]"
            :key="seat"
            class="pavilion-seat"
            :class="'seat-' + seat"
          >
            <text>空位</text>
          </view>
        </view>
        <view class="pavilion-description">
          这里预留四人组队与麻将空间。真人匹配和牌局尚未开放，先去找搭子小屋约一桌牌友吧。
        </view>
        <button class="pavilion-invite" @tap="goPartner">先去找牌友</button>
      </view>
    </view>
    <FishingPond
      v-if="pondOpen"
      :appearance="appearance"
      :wardrobe="wardrobeState?.equipped"
      @close="closePond"
      @wardrobe="receivingWardrobe"
      @dive="openDive"
    />
    <DiveAdventure
      v-if="diveOpen"
      :appearance="appearance"
      :wardrobe="wardrobeState?.equipped"
      @close="closeDive"
      @reward="receivingWardrobe"
    />
  </view>
</template>
<script setup>
import { nextTick, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { pet, bulletin, wardrobe } from '../../services/index.js'
import { formatTime } from '../../utils/routes.js'
import { config } from '../../config/index.js'
import { errorText } from '../../utils/errors.js'
import {
  isPlazaWelcomeDismissed,
  dismissPlazaWelcome
} from '../../utils/plaza-onboarding.js'
import PetAvatar from '../../components/pet/PetAvatar.vue'
import PlazaScene from '../../components/plaza/PlazaScene.vue'
import PlazaGuide from '../../components/plaza/PlazaGuide.vue'
import FishingPond from '../../components/plaza/FishingPond.vue'
import DiveAdventure from '../../components/plaza/DiveAdventure.vue'
const scene = ref(null),
  active = ref(false),
  appearance = ref(null),
  petLoading = ref(false),
  petError = ref(''),
  overview = ref(false),
  welcomeVisible = ref(!isPlazaWelcomeDismissed()),
  navigating = ref(false),
  navigationError = ref('')
const boardOpen = ref(false),
  boardTab = ref('activities'),
  boardLoading = ref(false),
  boardError = ref(''),
  announcements = ref([]),
  nextCursor = ref(null)
const pondOpen = ref(false),
  pavilionOpen = ref(false),
  wardrobeState = ref(null),
  diveOpen = ref(false),
  ornamentError = ref('')
let petRevision = 0,
  boardRevision = 0,
  ornamentRevision = 0
function activityDay(value) {
  const date = new Date(Date.parse(value) + 8 * 3600000)
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}
function dismissWelcome() {
  welcomeVisible.value = false
  dismissPlazaWelcome()
}
function toggleOverview() {
  dismissWelcome()
  overview.value = !overview.value
}
async function loadOrnament() {
  const current = ++ornamentRevision
  ornamentError.value = ''
  wardrobeState.value = null
  try {
    const state = await wardrobe.getState()
    if (current === ornamentRevision) receivingWardrobe(state)
  } catch (e) {
    if (current === ornamentRevision)
      ornamentError.value = `衣柜暂未读出：${errorText(e)}`
  }
}
function walkToArea(id) {
  if (!scene.value?.walkToArea(id))
    navigationError.value = '伙伴还在准备，稍后再出发。'
}
function openPond() {
  pondOpen.value = true
}
function closePond() {
  pondOpen.value = false
  loadOrnament()
}
function receivingWardrobe(state) {
  ornamentRevision++
  wardrobeState.value = state
  ornamentError.value = ''
}
function openDive() {
  pondOpen.value = false
  diveOpen.value = true
}
function closeDive() {
  diveOpen.value = false
  loadOrnament()
}
function openPavilion() {
  pavilionOpen.value = true
}
function goPartner() {
  pavilionOpen.value = false
  navigate('/pages/partner/index')
}
async function loadPet() {
  const current = ++petRevision
  appearance.value = null
  petLoading.value = true
  petError.value = ''
  try {
    const result = await pet.get()
    if (current === petRevision) appearance.value = result
  } catch (e) {
    if (current === petRevision)
      petError.value = `伙伴没能读出来：${errorText(e)}`
  } finally {
    if (current === petRevision) petLoading.value = false
  }
}
function navigate(url, tab = false) {
  if (navigating.value) return
  dismissWelcome()
  navigating.value = true
  navigationError.value = ''
  // 在跳转前恢复全局底栏配置；首个 tab 页可能卸载而不触发 onHide。
  uni.showTabBar({ animation: false })
  const options = {
    url,
    fail: (e) => {
      if (active.value) hidePlazaTabBar()
      navigationError.value = `暂时没能进入，请再试一次。${e?.errMsg || ''}`
      scene.value?.releaseEntry()
    },
    complete: () => {
      navigating.value = false
    }
  }
  tab ? uni.switchTab(options) : uni.navigateTo(options)
}
function enter(house) {
  navigate(house.url, house.tab)
}
function openPet() {
  navigate('/pages/pet/index')
}
function goMessages() {
  navigate('/pages/messages/index', true)
}
function goHome() {
  navigate('/pages/home/index', true)
}
async function hidePlazaTabBar() {
  // H5 缓存页重新激活时，等路由刷新后再调整底栏。
  await nextTick()
  if (active.value) uni.hideTabBar({ animation: false, fail: () => {} })
}
function openBoard() {
  boardTab.value = 'activities'
  boardOpen.value = true
  loadBoard()
}
function openGuide() {
  dismissWelcome()
  boardTab.value = 'guide'
  boardOpen.value = true
}
function showActivities() {
  boardTab.value = 'activities'
  if (!announcements.value.length && !boardLoading.value) loadBoard()
}
async function guideWalk(id) {
  closeBoard()
  await nextTick()
  const started = id === 'pond' ? scene.value?.walkToArea(id) : scene.value?.walkToHouse(id)
  if (!started) navigationError.value = '伙伴还在准备，稍后再出发。'
}
function closeBoard() {
  boardOpen.value = false
  boardRevision++
  boardLoading.value = false
}
async function loadBoard(more = false) {
  if (boardLoading.value) return
  const current = ++boardRevision
  boardLoading.value = true
  boardError.value = ''
  if (!more) {
    announcements.value = []
    nextCursor.value = null
  }
  try {
    const result = await bulletin.list({
      cursor: more ? nextCursor.value : undefined,
      pageSize: 10
    })
    if (current !== boardRevision) return
    announcements.value = more
      ? [...announcements.value, ...result.items]
      : result.items
    nextCursor.value = result.nextCursor
  } catch (e) {
    if (current === boardRevision) boardError.value = errorText(e)
  } finally {
    if (current === boardRevision) boardLoading.value = false
  }
}
onShow(() => {
  active.value = true
  navigating.value = false
  hidePlazaTabBar()
  loadPet()
  loadOrnament()
})
onHide(() => {
  active.value = false
  petRevision++
  ornamentRevision++
  // Keep game components mounted: their onHide hooks pause clocks and input.
  // Unmounting here would discard the current dive before it can be resumed.
  pavilionOpen.value = false
  closeBoard()
  // H5 在目标非 tab 页面已生效后可能调用该钩子，框架此时不接受底栏操作。
  uni.showTabBar({ animation: false, fail: () => {} })
})
onUnload(() => {
  active.value = false
  petRevision++
  ornamentRevision++
  pondOpen.value = false
  diveOpen.value = false
  pavilionOpen.value = false
  closeBoard()
  uni.showTabBar({ animation: false, fail: () => {} })
})
</script>
<style scoped>
.board-tabs { display: flex; gap: 6px; margin: 0 0 15px; padding: 4px; background: #e9e5cf; border-radius: 8px; }
.board-tabs button { flex: 1; min-height: 44px; padding: 10px 8px; background: transparent; color: #75806b; font-size: 14px; }
.board-tabs button.selected { color: #3d5e47; background: #fff9e8; box-shadow: 0 2px 0 #cdbf9e; }
.plaza-page {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #90ac79;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #304a3a;
}
button {
  margin: 0;
  line-height: 1.35;
  font-size: 13px;
}
button::after {
  border: 0;
}
button:focus-visible {
  outline: 3px solid #456957;
  outline-offset: 3px;
}
.game-top {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}
.activity-banner {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 206px;
  min-height: 54px;
  padding: 10px 18px 8px;
  color: #435b43;
  background: #fff8e8f2;
  border: 1px solid #bda77a;
  border-radius: 4px 4px 15px 15px;
  box-shadow: 0 4px 0 #846b4436;
  overflow: visible;
}
.activity-banner::before,
.activity-banner::after {
  content: '';
  position: absolute;
  top: -9px;
  width: 3px;
  height: 14px;
  background: #9d865a;
  border-radius: 3px;
}
.activity-banner::before {
  left: 19px;
}
.activity-banner::after {
  right: 19px;
}
.banner-title {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 3px;
}
.banner-caption {
  font-size: 10px;
  color: #8a805f;
}
.destination-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.area-action {
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  font-size: 11px;
  min-width: 54px;
}
.pond-symbol {
  position: relative;
  width: 22px;
  height: 17px;
  border-bottom: 2px solid #79a4a3;
  border-radius: 50%;
}
.pond-symbol::before {
  content: '';
  position: absolute;
  top: 0;
  left: 4px;
  width: 17px;
  height: 2px;
  background: #8d7146;
  transform: rotate(-35deg);
}
.pond-symbol::after {
  content: '';
  position: absolute;
  top: 5px;
  right: 3px;
  width: 4px;
  height: 7px;
  border: 1px solid #89aaa3;
  border-top: 0;
  border-radius: 0 0 5px 5px;
}
.pavilion-symbol {
  position: relative;
  width: 20px;
  height: 16px;
  border: 2px solid #8e9c76;
  border-top: 0;
  border-bottom-color: #a99878;
}
.pavilion-symbol::before {
  content: '';
  position: absolute;
  top: -4px;
  left: -5px;
  width: 26px;
  height: 5px;
  border-radius: 50% 50% 20% 20%;
  background: #7b9874;
}
.game-top button,
.game-bottom button {
  pointer-events: auto;
}
.pet-pass {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 3px 15px 3px 5px;
  min-height: 54px;
  background: #fffdf0f0;
  border: 1px solid #fffbed;
  border-radius: 32px;
  box-shadow: 0 3px 0 #36544235;
  color: #304a3a;
}
.pass-avatar {
  width: 44px;
  height: 48px;
  flex-shrink: 0;
}
.pass-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 135px;
}
.pass-name {
  font-weight: 650;
  font-size: 15px;
  max-width: 135px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pass-label {
  font-size: 11px;
  color: #6c8062;
}
.hud-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 58px;
  min-height: 46px;
  padding: 9px 13px;
  color: #344f3d;
  background: #fffdf1ef;
  border: 1px solid #fffbed;
  border-radius: 25px;
  box-shadow: 0 3px 0 #36544235;
}
.board-symbol {
  color: #8d7146;
  font-size: 25px;
  line-height: 1;
}
.game-status {
  position: absolute;
  top: calc(80px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 40px);
  padding: 8px 12px;
  border-radius: 10px;
  background: #fffdf0f0;
  color: #5f5947;
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.status-retry {
  padding: 4px 8px;
  background: #e5eddc;
  color: #456957;
  font-size: 12px;
  flex-shrink: 0;
}
.first-visit-note {
  position: absolute;
  left: 14px;
  bottom: calc(78px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  width: calc(100% - 28px);
  max-width: 350px;
  padding: 5px 5px 5px 12px;
  border: 1px solid #c5b384;
  border-radius: 4px 14px 14px 14px;
  background: #fffaeaf2;
  box-shadow: 0 3px 0 #36544222;
}
.welcome-guide {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  min-height: 48px;
  padding: 6px 0;
  color: #405b43;
  background: transparent;
  text-align: left;
  font-size: 12px;
  line-height: 1.5;
}
.welcome-detail {
  font-size: 11px;
  color: #7d8063;
}
.welcome-dismiss {
  flex: none;
  width: 44px;
  min-height: 44px;
  padding: 8px;
  font-size: 23px;
  line-height: 1.2;
  background: transparent;
  color: #7b8067;
}
.game-bottom {
  position: absolute;
  bottom: calc(14px + env(safe-area-inset-bottom));
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}
.demo-mark {
  padding: 5px 9px;
  font-size: 10px;
  color: #fffdf1;
  background: #304a3a99;
  border-radius: 12px;
  max-width: none;
}
.game-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.hud-icon {
  font-size: 21px;
  line-height: 1;
}
.home-icon {
  width: 20px;
  height: 20px;
}
.board-shade {
  position: absolute;
  z-index: 20;
  inset: 0;
  background: #1c372869;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 18px;
}
.bulletin-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 510px;
  max-height: calc(100% - 40px);
  background: #f7f3df;
  border: 5px solid #a88958;
  border-radius: 18px;
  box-shadow: 0 12px 40px #243a4055;
  overflow: hidden;
}
.bulletin-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 18px 14px;
  gap: 10px;
  background: #ede5c7;
}
.bulletin-title {
  font-size: 22px;
  font-weight: 650;
}
.bulletin-subtitle {
  font-size: 12px;
  color: #7c795b;
}
.board-close {
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  background: #fffdf0;
  color: #52664f;
  font-size: 30px;
  flex-shrink: 0;
}
.bulletin-content {
  min-height: 0;
  max-height: 54vh;
}
.bulletin-note {
  margin: 14px;
  padding: 15px;
  background: #fffdf1;
  border-bottom: 2px solid #ddd2a7;
}
.demo-tag {
  font-size: 10px;
  color: #8d7146;
}
.note-title {
  font-size: 16px;
  font-weight: 650;
  margin: 5px 0 8px;
}
.activity-note-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.activity-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 46px;
  min-height: 54px;
  flex-shrink: 0;
  background: #f0e8ce;
  border-radius: 5px;
  color: #8b7955;
  font-size: 10px;
  border-top: 4px solid #8fa37b;
}
.date-day {
  font-size: 24px;
  line-height: 1.1;
  font-weight: 650;
  color: #4f674f;
}
.activity-facts {
  font-size: 11px;
  line-height: 1.9;
  color: #7c7e63;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #ded8bb;
}
.participation-note {
  color: #456957;
  background: #edf1df;
  padding: 8px 10px;
  margin-top: 9px;
  border-radius: 5px;
  font-size: 11px;
  line-height: 1.6;
}
.pavilion-panel {
  position: relative;
  width: 100%;
  max-width: 410px;
  max-height: calc(100% - 24px);
  padding: 30px 22px 22px;
  background: #faf5e3;
  border: 4px solid #8eaa80;
  border-radius: 22px;
  text-align: center;
  overflow-y: auto;
}
.pavilion-kicker {
  font-size: 12px;
  color: #8a9677;
  display: block;
  margin-bottom: 8px;
}
.pavilion-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  font-size: 25px;
}
.pavilion-table-scene {
  position: relative;
  height: 220px;
  max-width: 260px;
  margin: 14px auto;
}
.pavilion-table {
  position: absolute;
  width: 128px;
  height: 112px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border: 9px solid #bda578;
  border-radius: 22px;
  box-shadow: 0 6px 0 #8f7c58;
  background: #6c987c;
  color: #e5eed7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}
.pavilion-seat {
  position: absolute;
  width: 48px;
  height: 37px;
  border: 3px solid #bbab86;
  background: #e1d3ad;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b8066;
  font-size: 11px;
}
.seat-1 {
  left: calc(50% - 24px);
  top: 1px;
}
.seat-2 {
  right: 0;
  top: calc(50% - 18px);
}
.seat-3 {
  left: calc(50% - 24px);
  bottom: 0;
}
.seat-4 {
  left: 0;
  top: calc(50% - 18px);
}
.pavilion-description {
  font-size: 13px;
  color: #78846b;
  line-height: 1.9;
  margin-bottom: 20px;
}
.pavilion-invite {
  min-height: 46px;
  padding: 12px;
  color: #fff9e8;
  background: #577d5f;
  border-radius: 12px;
}
.note-body {
  font-size: 13px;
  line-height: 1.8;
  color: #65705d;
}
.bulletin-state {
  padding: 24px;
  font-size: 14px;
  line-height: 1.8;
}
.bulletin-state button {
  margin-top: 12px;
}
.mail-link {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 16px;
  border-radius: 0;
  background: #456957;
  color: #fffdf0;
  font-size: 13px;
  flex-shrink: 0;
}
.more-notices {
  margin: 12px;
  color: #456957;
  background: transparent;
  min-height: 44px;
}
@media (max-width: 560px) {
  .activity-banner {
    top: 2px;
    width: 148px;
    min-height: 46px;
    padding: 8px 14px;
  }
  .banner-title {
    font-size: 15px;
  }
  .banner-caption {
    font-size: 9px;
  }
  .game-status {
    top: calc(80px + env(safe-area-inset-top));
  }
  .pet-pass {
    padding: 3px 10px 3px 4px;
    min-height: 48px;
    gap: 5px;
  }
  .pass-avatar {
    width: 32px;
    height: 38px;
  }
  .pass-copy,
  .pass-name {
    max-width: 52px;
  }
  .pass-name {
    font-size: 13px;
  }
  .pass-label {
    font-size: 9px;
  }
  .destination-actions {
    gap: 6px;
  }
  .area-action {
    width: 42px;
    min-width: 42px;
    min-height: 46px;
    padding: 7px 5px;
  }
  .game-bottom {
    flex-direction: column-reverse;
    align-items: flex-end;
    gap: 8px;
  }
  .first-visit-note {
    bottom: calc(125px + env(safe-area-inset-bottom));
  }
  .demo-mark {
    align-self: flex-start;
    max-width: none;
  }
  .game-actions .hud-button {
    flex-direction: column;
    gap: 3px;
    min-width: 62px;
    padding: 8px;
    font-size: 11px;
    border-radius: 18px;
  }
}
@media (max-width: 350px) {
  .pass-copy {
    display: none;
  }
  .activity-banner {
    width: 124px;
    padding-left: 6px;
    padding-right: 6px;
  }
  .area-action {
    width: 36px;
    min-width: 36px;
  }
}
@media (max-height: 500px) {
  .game-top {
    top: 8px;
  }
  .game-bottom {
    bottom: 8px;
  }
  .pet-pass {
    min-height: 44px;
  }
  .pass-avatar {
    height: 40px;
    width: 36px;
  }
  .game-status {
    top: 62px;
  }
  .first-visit-note {
    bottom: calc(85px + env(safe-area-inset-bottom));
  }
  .bulletin-content {
    max-height: 42vh;
  }
  .bulletin-heading {
    padding: 8px 14px;
  }
}
</style>
