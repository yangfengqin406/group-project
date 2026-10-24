export function createSeed(now = new Date()) {
  // 让演示计划始终在未来；不是预制的匹配结果。
  const day = new Date(now.getTime() + 3 * 86400000 + 8 * 3600000)
    .toISOString()
    .slice(0, 10)
  const at = (time) => `${day}T${time}:00+08:00`
  const common = {
    campusId: 'demo-campus',
    campusName: '示例校区',
    visibility: 'public',
    createdAt: now.toISOString(),
    images: []
  }
  const users = [
    {
      id: 'user_demo_a',
      nickname: '小林',
      campusId: 'demo-campus',
      campusName: '示例校区',
      skillTags: ['摄影', 'Python'],
      bio: '这是虚构的演示资料。'
    },
    {
      id: 'user_demo_b',
      nickname: '小桃',
      campusId: 'demo-campus',
      campusName: '示例校区',
      skillTags: ['设计', '英语'],
      bio: '想在校园找到一起做事的人。'
    },
    {
      id: 'user_demo_c',
      nickname: '小禾',
      campusId: 'demo-campus',
      campusName: '示例校区',
      skillTags: ['吉他'],
      bio: '分享闲置，也分享一点小技能。'
    }
  ]
  return {
    version: 1,
    currentUserId: users[0].id,
    users,
    contents: {
      plan: [
        {
          ...common,
          id: 'plan_demo_a',
          ownerId: users[0].id,
          type: 'plan',
          title: '周末上午一起看电影',
          body: '片子可以一起商量，看完顺路吃饭。',
          category: '电影',
          location: '校门口电影院',
          startAt: at('09:00'),
          endAt: at('12:00'),
          capacity: 2,
          memberIds: [users[0].id],
          status: 'open'
        },
        {
          ...common,
          id: 'plan_demo_b',
          ownerId: users[1].id,
          type: 'plan',
          title: '上午找个电影搭子',
          body: '希望找同校同学一起去。',
          category: '电影',
          location: '校门口电影院',
          startAt: at('10:00'),
          endAt: at('12:30'),
          capacity: 2,
          memberIds: [users[1].id],
          status: 'open'
        },
        {
          ...common,
          id: 'plan_demo_c',
          ownerId: users[2].id,
          type: 'plan',
          title: '傍晚操场散步',
          body: '绕操场走两圈，放松一下。',
          category: '散步',
          location: '操场',
          startAt: at('17:00'),
          endAt: at('18:00'),
          capacity: 3,
          memberIds: [users[2].id],
          status: 'open'
        }
      ],
      market: [
        {
          ...common,
          id: 'market_demo_lamp',
          ownerId: users[1].id,
          type: 'market',
          title: '闲置护眼台灯',
          body: '使用半年，灯光正常，校内当面查看。',
          category: '生活用品',
          marketType: 'sell',
          priceCents: 3500,
          condition: '九成新',
          handoverCampus: '主校区',
          imageIds: [],
          location: '图书馆门口',
          status: 'active'
        },
        {
          ...common,
          id: 'market_demo_book',
          ownerId: users[1].id,
          type: 'market',
          title: '高等数学同济七版（上下册）',
          body: '笔记较少，九成新，可单买可打包。',
          category: '教材',
          marketType: 'sell',
          priceCents: 3000,
          condition: '九成新',
          handoverCampus: '主校区',
          imageIds: [],
          location: '主校区教学楼',
          status: 'active'
        },
        {
          ...common,
          id: 'market_demo_buy_book',
          ownerId: users[0].id,
          type: 'market',
          title: '求购高等数学教材',
          body: '求一本同济七版高数教材，成色七成新以上即可。',
          category: '教材',
          marketType: 'buy',
          budgetCents: 5000,
          keywords: '高等数学',
          imageIds: [],
          location: '主校区',
          status: 'active'
        }
      ],
      lost_found: [
        {
          ...common,
          id: 'lost_demo_card',
          ownerId: users[2].id,
          type: 'lost_found',
          title: '图书馆捡到一个卡套',
          body: '请描述卡套外观确认归属，不公开卡内个人信息。',
          category: 'card',
          lostKind: 'found',
          location: '图书馆二楼',
          status: 'active'
        },
        {
          ...common,
          id: 'lost_demo_key',
          ownerId: users[1].id,
          type: 'lost_found',
          title: '操场看台附近丢失钥匙',
          body: '银色钥匙圈，有两把钥匙和一个蓝色小挂件。',
          category: 'key',
          lostKind: 'lost',
          location: '东操场看台',
          status: 'active'
        },
        {
          ...common,
          id: 'lost_demo_misc',
          ownerId: users[0].id,
          type: 'lost_found',
          title: '食堂拾到一把折叠伞',
          body: '请说明伞面颜色和伞柄特征后认领。',
          category: 'misc',
          lostKind: 'found',
          location: '一食堂二楼',
          status: 'returned'
        }
      ],
      help: [
        {
          ...common,
          id: 'help_demo_photo',
          ownerId: users[0].id,
          type: 'help',
          title: '想请同学教一下摄影构图',
          body: '可以交换 Python 入门讲解。',
          category: '摄影',
          location: '校园内',
          status: 'open'
        }
      ]
    },
    invitations: [],
    conversations: [],
    messages: [],
    comments: [],
    notifications: [],
    favorites: [],
    reports: [],
    uploads: [],
    reservations: [],
    idempotency: {}
  }
}
