export const WARDROBE_SLOTS = Object.freeze(
  [
    { id: 'hair', label: '发型' },
    { id: 'head', label: '头饰' },
    { id: 'outfit', label: '衣服' },
    { id: 'feet', label: '鞋袜' },
    { id: 'bag', label: '背包' },
    { id: 'hand', label: '手持' },
    { id: 'charm', label: '挂饰' }
  ].map((slot) => Object.freeze(slot))
)

export const STARTER_ITEMS = Object.freeze([])

const entries = [
  [
    'acorn-bob',
    '橡果短发',
    'hair',
    60,
    1,
    '通关第一关后 / 珍珠兑换',
    '像橡果帽一样柔软的短发。'
  ],
  [
    'cloud-bun',
    '云朵发髻',
    'hair',
    40,
    2,
    '第二关首通 / 珍珠兑换',
    '把轻盈的小云朵挽在耳边。'
  ],
  [
    'sea-braid',
    '海风双辫',
    'hair',
    85,
    2,
    '通关第二关后 / 珍珠兑换',
    '两束辫子装着从海边带回的风。'
  ],
  [
    'lily-pad',
    '小荷叶',
    'head',
    25,
    0,
    '钓鱼收集 / 珍珠兑换',
    '池塘捎来的一片清凉荷叶。'
  ],
  [
    'reed-bow',
    '芦苇结',
    'head',
    30,
    0,
    '钓鱼收集 / 珍珠兑换',
    '用柔软芦苇系成的小蝴蝶结。'
  ],
  [
    'straw-hat',
    '草编小帽',
    'head',
    55,
    1,
    '通关第一关后 / 珍珠兑换',
    '挡一挡午后阳光的小草帽。'
  ],
  [
    'shell-crown',
    '贝壳皇冠',
    'head',
    65,
    3,
    '第三关首通 / 珍珠兑换',
    '用海底小贝壳拼成的皇冠。'
  ],
  [
    'sailor-shirt',
    '水手衫',
    'outfit',
    40,
    1,
    '第一关首通 / 珍珠兑换',
    '一起出发去看海的蓝白水手衫。'
  ],
  [
    'moss-cape',
    '苔绿斗篷',
    'outfit',
    65,
    1,
    '通关第一关后 / 珍珠兑换',
    '树荫颜色的小斗篷。'
  ],
  [
    'coral-dress',
    '珊瑚裙',
    'outfit',
    90,
    2,
    '通关第二关后 / 珍珠兑换',
    '像珊瑚一样轻轻展开的裙摆。'
  ],
  [
    'rain-boots',
    '雨点靴',
    'feet',
    60,
    1,
    '通关第一关后 / 珍珠兑换',
    '下过雨的小路也可以放心走。'
  ],
  [
    'shell-shoes',
    '贝壳鞋',
    'feet',
    35,
    1,
    '第一关首通 / 珍珠兑换',
    '鞋尖藏着两枚小贝壳。'
  ],
  [
    'leaf-slippers',
    '叶子拖鞋',
    'feet',
    45,
    1,
    '通关第一关后 / 珍珠兑换',
    '踩着叶子，慢慢散步。'
  ],
  [
    'leaf-backpack',
    '叶子背包',
    'bag',
    90,
    2,
    '通关第二关后 / 珍珠兑换',
    '装下零食和小发现的叶子包。'
  ],
  [
    'shell-pouch',
    '贝壳挎包',
    'bag',
    45,
    2,
    '第二关首通 / 珍珠兑换',
    '把喜欢的小东西收进贝壳。'
  ],
  [
    'bottle-bag',
    '漂流瓶包',
    'bag',
    80,
    2,
    '通关第二关后 / 珍珠兑换',
    '透明小瓶里装着海边的故事。'
  ],
  [
    'tiny-net',
    '小捞网',
    'hand',
    50,
    1,
    '通关第一关后 / 珍珠兑换',
    '去池边观察小鱼的迷你捞网。'
  ],
  [
    'clover-umbrella',
    '三叶草伞',
    'hand',
    75,
    2,
    '通关第二关后 / 珍珠兑换',
    '撑起一片幸运的小树荫。'
  ],
  [
    'star-wand',
    '星星魔杖',
    'hand',
    65,
    3,
    '第三关首通 / 珍珠兑换',
    '把一颗小星星握在手里。'
  ],
  [
    'bubble-star',
    '水泡星',
    'charm',
    35,
    0,
    '钓鱼收集 / 珍珠兑换',
    '池塘水泡里亮晶晶的小星星。'
  ],
  [
    'pearl-badge',
    '珍珠徽章',
    'charm',
    50,
    3,
    '第三关首通 / 珍珠兑换',
    '纪念海底旅程的小徽章。'
  ],
  [
    'clover-pin',
    '三叶草别针',
    'charm',
    45,
    1,
    '通关第一关后 / 珍珠兑换',
    '陪你出门的一点幸运。'
  ],
  [
    'glow-jelly',
    '荧光水母',
    'charm',
    90,
    3,
    '通关第三关后 / 珍珠兑换',
    '像水母一样温柔发亮的小挂件。'
  ]
]

export const WARDROBE_ITEMS = Object.freeze(
  entries.map(([id, name, slot, cost, , source, description]) =>
    Object.freeze({ id, name, slot, cost, unlockLevel: 0,
      source: source.includes('首通') || source.includes('钓鱼')
        ? source.replace('珍珠兑换', '校园贡献珍珠兑换') : '校园贡献珍珠兑换', description })
  )
)
