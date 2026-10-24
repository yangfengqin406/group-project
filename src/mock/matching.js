function campusDay(iso) {
  return new Date(new Date(iso).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10)
}
export function findCandidates(plan, plans, now = Date.now()) {
  if (
    plan.visibility !== 'public' ||
    plan.joinedPlanId ||
    plan.status !== 'open' ||
    plan.memberIds.length >= plan.capacity ||
    Date.parse(plan.endAt) <= now
  )
    return []
  return plans
    .filter(
      (other) =>
        other.id !== plan.id &&
        other.ownerId !== plan.ownerId &&
        !plan.memberIds.includes(other.ownerId) &&
        other.visibility === 'public' &&
        !other.joinedPlanId &&
        other.campusId === plan.campusId &&
        other.category === plan.category &&
        other.status === 'open' &&
        other.memberIds.length === 1 &&
        other.memberIds.length < other.capacity &&
        Date.parse(other.endAt) > now &&
        campusDay(other.startAt) === campusDay(plan.startAt) &&
        Math.max(Date.parse(other.startAt), Date.parse(plan.startAt)) <
          Math.min(Date.parse(other.endAt), Date.parse(plan.endAt))
    )
    .map((other) => ({
      candidatePlanId: other.id,
      ownerId: other.ownerId,
      overlap: {
        startAt: new Date(
          Math.max(Date.parse(other.startAt), Date.parse(plan.startAt))
        ).toISOString(),
        endAt: new Date(
          Math.min(Date.parse(other.endAt), Date.parse(plan.endAt))
        ).toISOString()
      },
      reasons: ['同一校区', `都想${plan.category}`, '同一天且时间有重叠']
    }))
}
