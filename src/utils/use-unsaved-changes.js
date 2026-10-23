import { watch } from 'vue'
import { onBackPress, onUnload } from '@dcloudio/uni-app'

// UI-only protection: drafts stay in memory and are never written to business storage.
export function useUnsavedChanges(isDirty) {
  let confirming = false
  let allowBack = false
  let alerted = false
  const beforeUnload = (event) => {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  // #ifdef H5
  if (typeof window !== 'undefined')
    window.addEventListener('beforeunload', beforeUnload)
  // #endif
  const stop = watch(isDirty, (dirty) => {
    // WeChat protects its native back button; gesture-back is a platform limitation.
    // #ifdef MP-WEIXIN
    if (typeof uni.enableAlertBeforeUnload === 'function' && dirty && !alerted) {
      uni.enableAlertBeforeUnload({ message: '还有未保存的修改，返回后会丢失。', fail() {} })
      alerted = true
    } else if (!dirty && alerted) {
      uni.disableAlertBeforeUnload?.({ fail() {} })
      alerted = false
    }
    // #endif
  }, { immediate: true, flush: 'sync' })
  onBackPress(() => {
    if (allowBack || !isDirty.value) return false
    if (!confirming) {
      confirming = true
      uni.showModal({
        title: '离开这张未保存的纸条？',
        content: '已填写的内容还没有保存。离开后需要重新填写。',
        confirmText: '放弃修改',
        cancelText: '继续填写',
        success(result) {
          if (result.confirm) {
            allowBack = true
            uni.navigateBack({
              fail() { allowBack = false }
            })
          }
        },
        complete() { confirming = false }
      })
    }
    return true
  })
  onUnload(() => {
    stop()
    // #ifdef H5
    if (typeof window !== 'undefined')
      window.removeEventListener('beforeunload', beforeUnload)
    // #endif
    // #ifdef MP-WEIXIN
    if (alerted) uni.disableAlertBeforeUnload?.({ fail() {} })
    // #endif
  })
}
