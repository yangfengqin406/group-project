import { findCandidates } from './matching.js'

// 旧演示存档也在服务读取时归一；终态不因扩容或时钟变化复活。
export function reconcilePlanState(db, now = Date.now()) {
  const plans = db.contents.plan
  for (const plan of plans) {
    if (!['open', 'full'].includes(plan.status)) continue
    plan.status =
      Date.parse(plan.endAt) <= now
        ? 'expired'
        : plan.memberIds.length >= plan.capacity
          ? 'full'
          : 'open'
  }
  for (const invitation of db.invitations) {
    if (invitation.status !== 'pending') continue
    const target = plans.find((plan) => plan.id === invitation.targetPlanId)
    const source = plans.find((plan) => plan.id === invitation.sourcePlanId)
    if (
      !target ||
      !source ||
      !findCandidates(target, plans, now).some(
        (candidate) => candidate.candidatePlanId === source.id
      )
    )
      invitation.status = 'expired'
  }
}
