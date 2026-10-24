# 广场资源与迁移记录

## 10月24日运行素材传输优化

A（杨凤琴）对现有运行素材做FFmpeg/libwebp重编码，不生成新造型，不裁切、不缩放，不改精灵帧、衣身/发型/脚掌锚点。158张非底栏PNG改为WebP，四宠基础图集quality90，其余quality85；既有室内背景与广场底图分别重编码为quality65/70。底栏PNG、用户原创PNG导入和各历史存档格式不变，也不新增远程素材依赖。

160张处理图逐张解码核对像素数量及RGBA透明通道，透明像素值全部一致；RGB为有损编码，最终效果另做H5实际显示复核，不能称像素完全无损。处理图合计从3286308降为1544772字节，减少1741536字节；全量静态素材约1576425字节。原PNG保留在Git历史与仓库外验收备份，当前运行路径统一为相同名字的`.webp`；下方按日期的PNG路径、体积及生成说明为当时快照。逐图哈希、编码参数和透明通道核对见[编码记录](assets/quality-2026-10-24/asset-encoding.json)，两端构建及预算实际结果见[验证记录](verification.md)。

## 10月23日小狗传输体积优化

A（杨凤琴）按已确认的素材优化范围，用现有FFmpeg对同一张透明小狗确定性缩放与WebP重编码，未改角色造型和绘画内容：`scale=360:-1:flags=lanczos`、`libwebp quality 85 compression_level 6`。原1211×1299、238430字节，现360×386、30182字节，减少208248字节（87.3%）；仍超过页面85×100与场景49×58的显示分辨率。图像经解码和目视检查，透明背景保留。完整衣身、发型、鞋和原创宠物降级资源仍保留，不通过删掉有效资源缩包。两端重建后的体积见verification.md；目录统计不代替微信上传包与真机验收。

## 邻里向导与室内画（2026-10-21）

本轮使用内置 imagegen 生成，参考已有广场底图与精绘兔子 atlas 的画风，不复制第三方游戏角色。最终运行文件位于 `src/static/village/`，原始生成 PNG 保留在本机 `.codex/generated_images/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/`。只用 FFmpeg libwebp quality 88 转换传输格式，不裁切或改画，运行时按四象限显示室内图。

| 运行文件 | 尺寸 | 字节 | 原生成文件 |
| --- | --- | --- | --- |
| room-interiors.webp | 1774×887 | 457,766 | exec-9eb45a41-f59f-47b7-9982-503ad1309411.png |
| guide-puppy.webp | 1211×1299，有透明通道 | 238,430 | exec-a9646b44-bc50-4c69-97a9-923f9fdd8c67.png |

合计 696,196 字节。室内图左上搭子、右上失物、左下二手、右下自己的家；小狗“麦麦”只作为指南角色，不加入宠物物种或公开 User。实际生成室内尺寸与请求的理想 2048×1024 不同，比例仍为 2:1，组件不依赖指定像素尺寸。

室内图提示词：

> Use case: illustration-story. Project asset: room-interiors.png, a precise 2 by 2 atlas of FOUR cozy storybook interiors, total wide 2:1 canvas ideally 2048x1024, equal quadrants each 2:1. No gutters or frames. Reference image 1 is ONLY the art style and palette of the existing campus plaza, reference image 2 its resident pet style. Paint a continuation of this warmly lit, finely brushed, whimsical hand painted village, no characters. Top left: lilac partner meeting cottage with lavender cushioned seats, little wooden table, paper activity noticeboard. Top right: terracotta orange lost-property cottage with rounded wooden reception counter, baskets and tidy storage cubbies. Bottom left: warm coral striped secondhand shop canopy interior with wooden shelves, books, small reused household goods. Bottom right: sage green personal home with arched window, soft rug, wardrobe and little writing desk. Each cell wide scene, same slightly elevated front view and scale, airy and quiet, soft daylight, wood and cream plaster, small potted greenery, gentle rounded forms. No letters, numbers, logos, no UI, no people, no pets, no watermarks. All four rooms fill their complete cell with no external margin. This is new asset; do not reproduce exterior buildings.

小狗提示词：

> Use case: illustration-story. New transparent character asset guide-puppy.png for cozy campus village game. Reference image 1 is plaza style only; reference image 2 is the exact desired refined soft-fur pet rendering quality. One adorable tiny cream and light caramel puppy, round head, floppy ears, shiny dark warm eyes, rosy cheeks, small friendly smile, short plump body, four little paws, moss green cloth scarf, gently waving one front paw in greeting. Standing three-quarter front view, full body, centered with small breathing space, soft painterly fur edges, warm delicate brown outlines, coherent anatomy, playful cozy woodland illustration. Transparent background, no ground scene, no text, no border, no shadow rectangle, no extra animals, no sticker outline. This puppy is a fixed bulletin guide, not a new selectable pet species.

## 原有资源

第一阶段保留 A 提供的旧广场构图与豆豆角色。业务页面继续使用项目的 uni-app + Vue 3 服务层，不直接嵌入原型的 HTML、DOM 脚本或业务存储。

| 资源 | 来源与处理 | 交付文件 |
| --- | --- | --- |
| 广场底图 | 用户提供的 `campus-plaza-demo-source.zip` 中 `assets/world.webp`；用 ImageGen 编辑屋顶徽章，保持四栋建筑、步道、树岛和原有像素画风 | `src/static/plaza/world-phase-one.webp` |
| 豆豆角色 | 参考同一原型的 CSS 造型，在 uni-app 的 view 组件内重绘；颜色、肢体、配饰与走动动画独立实现 | `src/components/plaza/PlazaBean.vue` |
| 本地移动 | 按底图步道建立归一化闭合路径；点击投影到最近步道，选择较短方向，避免穿过树岛 | `src/utils/plaza-motion.js` |

底图生成方式为 **编辑已有图片**，输入为用户 ZIP 的原底图，使用内置 ImageGen；不生成文字或导航按钮。编辑提示要点：

> 保留原图构图、四栋房子的位置、道路、中心树岛、景观和像素色彩。只调整屋顶的业务徽章：左上游戏手柄改为两个友好的人物，右上胶片改为放大镜与找到的物品，左下二手商店保持原样，右下工具改为带嫩芽的小房子。不要新增建筑、人物或文字。

生成后仅进行尺寸调整和格式压缩：1280 × 801，WebP，quality 86，最终 305,788 字节（约 299 KiB）。背景完整显示；可点击招牌由组件覆盖，避免小屏裁切和图片内文字不可交互。

原型的 Lucide 脚本及其他 vendor 文件没有迁入；本次没有增加运行时依赖。装饰豆豆不关联真实账号，也不表示多人在线。微信产物可编译；图片显示与触摸行为仍需在微信开发者工具、真机中验收。

## 休息亭与钓鱼栈台（2026-10-15）

两张独立场景资产均使用 **内置 ImageGen 生成模式**，以本项目 `world-phase-one.webp` 作为画风与视角参照，明确设置 `transparent_background: true`。没有修改底图或手工抠除背景；生成后仅等比缩小和压缩 PNG，保留原透明通道。开放休息亭是四个空座的景观，不代表第五栋业务房子或真人匹配。

| 资源 | 文件 | 实际尺寸与体积 |
| --- | --- | --- |
| 苔绿瓦顶、木柱、石基、花藤、四空坐垫与茶桌的小亭 | `src/static/plaza/pavilion.png` | 384 × 307；221,358 字节 |
| 低矮木平台、磨损木纹、短桩与鱼竿的栈台 | `src/static/plaza/fishing-dock.png` | 384 × 128；71,737 字节 |

`PlazaLeisure.vue` 按既有场景坐标叠加图片，使用 `aspectFit`；保留踏石、可点击地点与导航支路。已检查两图都有 alpha 且不是全不透明；H5 与微信显示效果由本轮整体验收记录。

<details>
<summary>休息亭完整生成提示</summary>

```text
Use case: stylized-concept. Asset type: a transparent-background cutout game prop to overlay onto the supplied cozy campus plaza background. Input image 1 is STYLE AND CAMERA REFERENCE ONLY; do not edit or reproduce the whole scene. Generate ONLY ONE small open garden rest pavilion, complete and uncropped, centered, filling about 88% of the image, with a genuinely transparent alpha background. Match the reference's sunlit, finely detailed hand-painted pixel watercolor illustration: warm soft brown outlines, mottled painted wood grain, tiny visible sage-green curved roof tiles, subtly irregular stone edges, small pastel flowers and climbing leafy vine on one outside post, natural top-left sunshine and soft tiny contact shadow. Camera is the same slightly elevated 3/4 front view as the buildings in the reference, showing roof surface and the inside floor, roughly 30-degree downward view. The pavilion is an open-sided modest park shelter, not an enclosed house or shop: low sage-green curved tiled roof, four slender warm weathered wood columns, warm pale stone low base with one shallow front step, FOUR clearly empty small round green seat cushions/stools arranged around ONE low small wooden tea table. All seats must be visibly unoccupied. Keep the design compact and welcoming, fine painterly texture consistent with the reference, not flat vector geometry or 3D plastic. No people, pets, fish, words, labels, symbols, icons, signboards, logos, watermark, surrounding landscape, sky, grass patch, fence or white background. The full pavilion and base must have clean transparent exterior edges. It is a decorative rest area, not a fifth business building.
```

</details>

<details>
<summary>钓鱼栈台完整生成提示</summary>

```text
Use case: stylized-concept. Asset type: isolated transparent game prop, a tiny fishing dock extension for the southwest pond of the supplied cozy campus plaza. Input image is STYLE AND CAMERA REFERENCE ONLY; do not reproduce or edit the scene. Generate ONE low horizontal weathered timber fishing platform, wide landscape composition about 3:1, complete uncropped asset filling the canvas, with genuinely transparent alpha outside. Match the reference's detailed hand-painted pixel-watercolor illustration, warm soft brown linework, mottled wood grain, tiny worn nails, subtle sage moss, afternoon light from upper left. Same elevated three-quarter view looking down roughly 30 degrees as the bridge at bottom left of the reference. A modest plank floor with visible broad top surface and only a shallow thin front edge; NOT a vertical fence or wall, NOT a tall pier. Short supporting wooden posts, two short waist-low posts and light rope only along the back edge, a completely open near/front fishing edge with no railing hiding the player's feet. A small simple fishing rod rests diagonally at the far-left corner, with a fine loose line, no person holding it. The little platform should connect to an existing bridge at its upper-right approach, and feel compact rather than a large new structure. No water, shore, grass, landscape patch, people, pets, fish, bobber, text, labels, logos, watermark, sky or opaque background. Preserve clean transparent edges and soft tiny contact shading only immediately beneath the timbers.
```

</details>

## 四款精绘宠物图集（2026-10-16）

用户指定本会话的四款概念图 `exec-77507d1e-5aee-4f78-9998-2c2c0ac45802.png` 为形象参考。使用 **内置 ImageGen 生成模式**，每个物种独立生成透明精灵图集，设置 `transparent_background: true`；保留绒毛高光、细像素轮廓、菌褶、宽鼻和卷尾，不把配饰画死在身体上。水豚的背面立耳另外用内置工具修正为外侧绒毛，避免背面出现粉色内耳。

生成后只按格裁切、等比缩放、对齐脚底并压缩 PNG；不人工去底、不用 SVG 或 CSS 形状替代主形象。保留 RGBA 软透明边缘，每帧 144 × 176，脚底统一在距格底约 6 像素处。所有图集第一行为正面、第二行为真实背面，列顺序与 `featuresFor` 一致：

| 物种 | 图集与列顺序 | 尺寸 | 字节 |
| --- | --- | --- | --- |
| 森芽菇 | `src/static/pets/mushroom-atlas.png`；round-cap / wide-cap | 288 × 352 | 113,769 |
| 栗团水豚 | `src/static/pets/capybara-atlas.png`；round / perky | 288 × 352 | 164,135 |
| 糯叶兔 | `src/static/pets/rabbit-atlas.png`；floppy / upright / short | 432 × 352 | 189,895 |
| 铃果松鼠 | `src/static/pets/squirrel-atlas.png`；pointed / round | 288 × 352 | 144,696 |

共 18 帧、612,495 字节（约 598.1 KiB）。已检查真实 alpha、图集尺寸、全部形态与正背面映射。运行时由 `pet-illustrations.js` 和 `PetIllustration.vue` 选帧；奶油配色保留原画色，苔绿/杏桃/淡紫仅对精灵使用可见 CSS 色调，衣柜层保留独立颜色。图片加载失败才使用原代码造型兜底。行走仍为整只轻摆，不宣称已具备逐帧骨骼或多方向动画；H5 与微信整体验证见本轮验证记录。

<details>
<summary>mushroom 图集完整生成提示</summary>

```text
Use case: stylized-concept. Production game character sprite atlas, truly transparent alpha background. The attached concept sheet is the exact visual character and texture reference, not a sheet layout to copy. Match its exquisite plush furry hand-painted PIXEL illustration, warm fine brown pixel contours, tiny cream fur highlights, warm soft shading, sweet shiny dark eyes, small rosy cheeks, tiny gentle mouth, very cute compact chubby proportions and short visible feet. NOT flat vector/CSS shapes, NOT a 3D plastic toy. No accessories at all: no bags, scarves, flowers, leaves, bows, hats added beyond the mushroom's actual cap, or held props. No ground plane, no cast shadow, no text, no letters, no borders, no grid lines, no checkerboard, no opaque fill. Every character is a complete isolated full-body sprite with ample transparent gutters so the cells can be cut. All views have the same body scale, body center and exact foot baseline within their equal cells. Straight frontal standing pose with tiny paws near chest in the first row, true directly rear-facing view in second row showing back of head/body with NO eyes or face. These are not sideways mirrored fronts. Keep exactly the requested number of sprites. Species A: the reference's adorable cream fuzzy mushroom spirit under a sage-green spotted mushroom cap, fine underside gills in front view, tiny brown feet. ONE square 1024x1024 sheet, EXACTLY 2 columns and 2 rows, four equal 512x512 cells. Column 1 is round-cap: rounded high mushroom cap. Column 2 is wide-cap: a wider lower umbrella cap with same face and body proportions. Top row front views in that order; bottom row matching BACK views in same order, showing cap back and cream back body, not frontal gills. Center each character inside its cell with feet at 92% cell height; leave at least 8% transparent margin on every side. Total exactly FOUR mushroom sprites, no other species.
```

</details>

<details>
<summary>capybara 图集完整生成提示</summary>

```text
Use case: stylized-concept. Production game character sprite atlas, truly transparent alpha background. The attached concept sheet is the exact visual character and texture reference, not a sheet layout to copy. Match its exquisite plush furry hand-painted PIXEL illustration, warm fine brown pixel contours, tiny cream fur highlights, warm soft shading, sweet shiny dark eyes, small rosy cheeks, tiny gentle mouth, very cute compact chubby proportions and short visible feet. NOT flat vector/CSS shapes, NOT a 3D plastic toy. No accessories at all: no bags, scarves, flowers, leaves, bows, hats added beyond the mushroom's actual cap, or held props. No ground plane, no cast shadow, no text, no letters, no borders, no grid lines, no checkerboard, no opaque fill. Every character is a complete isolated full-body sprite with ample transparent gutters so the cells can be cut. All views have the same body scale, body center and exact foot baseline within their equal cells. Straight frontal standing pose with tiny paws near chest in the first row, true directly rear-facing view in second row showing back of head/body with NO eyes or face. These are not sideways mirrored fronts. Keep exactly the requested number of sprites. Species B: the reference's adorable orange-apricot plush CAPYBARA with very broad calm muzzle, tiny rounded dark nose and nostrils, rounded square big head, short paws, cream chest, barrel-shaped body. Not a bear or hamster. ONE square 1024x1024 sheet, EXACTLY 2 columns and 2 rows, four equal 512x512 cells. Column 1 round: small round ears. Column 2 perky: slightly raised oval alert ears; retain capybara identity and keep head/body exactly the same, not long rabbit ears. Top row matching front views in that order; bottom row true rear views with plain fuzzy round backs, no muzzle or eyes, capybara has no conspicuous tail. Center each character in its cell with feet at 92% height; at least 8% transparent gutter. Total exactly FOUR capybara sprites.
```

</details>

<details>
<summary>rabbit 图集完整生成提示</summary>

```text
Use case: stylized-concept. Production game character sprite atlas, truly transparent alpha background. The attached concept sheet is the exact visual character and texture reference, not a sheet layout to copy. Match its exquisite plush furry hand-painted PIXEL illustration, warm fine brown pixel contours, tiny cream fur highlights, warm soft shading, sweet shiny dark eyes, small rosy cheeks, tiny gentle mouth, very cute compact chubby proportions and short visible feet. NOT flat vector/CSS shapes, NOT a 3D plastic toy. No accessories at all: no bags, scarves, flowers, leaves, bows, hats added beyond the mushroom's actual cap, or held props. No ground plane, no cast shadow, no text, no letters, no borders, no grid lines, no checkerboard, no opaque fill. Every character is a complete isolated full-body sprite with ample transparent gutters so the cells can be cut. All views have the same body scale, body center and exact foot baseline within their equal cells. Straight frontal standing pose with tiny paws near chest in the first row, true directly rear-facing view in second row showing back of head/body with NO eyes or face. These are not sideways mirrored fronts. Keep exactly the requested number of sprites. Species C: the reference's adorable creamy ivory plush RABBIT with velvety pink inner ears, very round little head, cream chest, small round tail on back, tiny paws and feet, not wearing any bag. ONE landscape 1536x1024 sheet, EXACTLY 3 columns and 2 rows, six equal 512x512 cells. Column 1 floppy: one upright left ear and one long softly folded right ear, just like the reference. Column 2 upright: both long ears upright. Column 3 short: two short rounded bunny ears. All THREE have identical face, body and foot positions; change ONLY ear shape. Top row front views in order floppy/upright/short; bottom row matching true BACK views with no face, no pink inner ear surfaces, and a cute small centered white tail puff. Feet exactly aligned at 92% of every cell; transparent gutters at least 8% every side. Total exactly SIX rabbit sprites.
```

</details>

<details>
<summary>squirrel 图集完整生成提示</summary>

```text
Use case: stylized-concept. Production game character sprite atlas, truly transparent alpha background. The attached concept sheet is the exact visual character and texture reference, not a sheet layout to copy. Match its exquisite plush furry hand-painted PIXEL illustration, warm fine brown pixel contours, tiny cream fur highlights, warm soft shading, sweet shiny dark eyes, small rosy cheeks, tiny gentle mouth, very cute compact chubby proportions and short visible feet. NOT flat vector/CSS shapes, NOT a 3D plastic toy. No accessories at all: no bags, scarves, flowers, leaves, bows, hats added beyond the mushroom's actual cap, or held props. No ground plane, no cast shadow, no text, no letters, no borders, no grid lines, no checkerboard, no opaque fill. Every character is a complete isolated full-body sprite with ample transparent gutters so the cells can be cut. All views have the same body scale, body center and exact foot baseline within their equal cells. Straight frontal standing pose with tiny paws near chest in the first row, true directly rear-facing view in second row showing back of head/body with NO eyes or face. These are not sideways mirrored fronts. Keep exactly the requested number of sprites. Species D: the reference's adorable orange-cinnamon plush SQUIRREL with a very prominent beautiful large curled tail at the left side, cream heart-shaped muzzle and chest, fine fluffy fur, short paws and feet. ONE square 1024x1024 sheet, EXACTLY 2 columns and 2 rows, four equal 512x512 cells. Column 1 pointed: small pointed tufted squirrel ears. Column 2 round: smaller rounded squirrel ears, not capybara ears; identical body, face and large curled tail. Top row front views in that order; bottom row true BACK views with no face and a prominent large fluffy curled tail in front of its lower back. Center each character in its own equal cell with feet at 92% height; at least 8% transparent gutters. Total exactly FOUR squirrel sprites.
```

</details>

<details>
<summary>水豚背耳单项编辑提示</summary>

```text
Use case: precise-object-edit. This image is a 2-column by 2-row production capybara sprite atlas on real transparent alpha. Change ONLY the two pink inner-ear patches on the BOTTOM-RIGHT rear-facing capybara: replace those pink patches with the same orange-apricot furry BACK surfaces of its ears, so a true rear view has no visible pink inner ear. The bottom-left back-view ears already show the correct outer fur; use those as the reference. Keep absolutely everything else unchanged: all four complete sprites, exact positions, body proportions, identical brown outlines, face features in the two TOP front-view cells, fur texture, colors, feet baselines, 2x2 cell arrangement, canvas size and transparency. Do not add clothing, accessories, backgrounds, labels, shadows or new characters. Preserve real transparent alpha around every character. Only fix the bottom-right rear ears.
```

</details>

## 装扮材质与正背面资源（2026-10-18 需求，2026-10-19 整理）

用户要求衣服、鞋子与配饰呈现穿在宠物身上的感觉。本轮用 **内置 ImageGen 生成模式**，以现有 `rabbit-atlas.png` 与 `capybara-atlas.png` 为画风参考，独立生成八套装扮图集，全部明确设置 `transparent_background: true`。只生成装扮，没有把身体、爪子、脸或假人画进服装；素材是新生成的手绘插画，没有下载其他游戏的衣柜资产。

每套图集第一行正面、第二行对应背面。水手衫背面使用方形领片，不重复前面的领结；斗篷背面为闭合布料；裙子背面使用纽扣。鞋子具有鞋口、内衬、厚底和不同的后跟；背包背面为接触身体的背板，围巾背面没有正面垂结。发型正面留透明脸部开口，背面为完整后脑发型。袋体不包含长肩带，运行时按肩膀和身体锚点补带；手持物保留完整细柄，通过资源元数据握点定位。

生成后仅按格及 alpha 边界裁框、等比缩小、保留透明边距并压缩为带多级透明度的 256 色索引 PNG。没有人工抠除背景、重绘素材或用 CSS 色块替代材质。海风双辫背面额外缩小上沿裁框，以排除上一格发梢越界；保留本格完整发型。运行时新增素材位于 `src/static/pets/wearables/`，命名为 `<item-id>-front.png` / `<item-id>-back.png`；`wearable-art.js` 提供资源路径、自然宽高及手持柄归一化握点，不改变衣柜存档格式。

| 类别 | 物品 ID（列顺序） | 正背文件数 | 合计字节 |
| --- | --- | --- | --- |
| 发型 | acorn-bob / cloud-bun / sea-braid | 6 | 45,964 |
| 头饰 | lily-pad / reed-bow / straw-hat / shell-crown | 8 | 49,128 |
| 衣服 | sailor-shirt / moss-cape / coral-dress | 6 | 43,530 |
| 鞋袜 | rain-boots / shell-shoes / leaf-slippers | 6 | 47,767 |
| 背包 | leaf-backpack / shell-pouch / bottle-bag | 6 | 58,850 |
| 手持 | tiny-net / clover-umbrella / star-wand | 6 | 43,513 |
| 挂饰 | bubble-star / pearl-badge / clover-pin / glow-jelly | 8 | 76,063 |
| 旧配饰兼容 | legacy-scarf / legacy-flower | 4 | 30,003 |

共 **25 件、50 张 PNG、394,818 字节（约 385.6 KiB）**。手持图最大边 144 像素，其余最大边 128 像素；23 件目录物品的正背路径均已检查存在，另两件只服务旧外观兼容，不新增可兑换物品。所有最终文件均检查了真实全透明区和非二值软 alpha。穿戴的遮挡、锚点与两端显示效果由整体验收记录；素材检查本身不表示微信真机验收。

内部 `legacy-satchel` 复用 `leaf-backpack` 图片，采用小斜挎包的定位与肩带，不产生额外物品或图片。圆伞基础图右侧既有的两处孤立棕色碎片在 `PetIllustration` 使用原生可视窗裁去，保持原图帧大小、位置和宽伞不变，未重绘或覆盖原始图集。

原始 ImageGen 输出保留在本机生成目录，以下文件名用于追溯，每个提示均附上完整正文。项目运行只使用上表对应的最终 PNG。

<details>
<summary>outfit 图集：exec-b4392c5d-8554-48f6-b5e0-6e401f4854b9.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine fabric grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. These assets will be worn by tiny, chubby, very round fuzzy animals. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in the appropriate on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no letters, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK must show appropriate rear seams and no FRONT-facing ties/buttons unless naturally present. No objects cross cell boundaries.
EXACTLY THREE columns by TWO rows: six cells in a wide 1536x1024 atlas. Each cell's wearable must fit a wide, squat, spherical chubby animal torso (NOT a long humanoid torso), with gently rounded belly silhouette and very small stubby sleeve openings. Column 1: sailor-shirt, ivory cotton sailor shirt with dusty ocean blue folded collar, blue edging and a tiny front scarf-knot, curved wide short sleeves, thick softly folded lower hem; matching back has a broad blue square sailor collar and plain ivory back, NO front necktie. Column 2: moss-cape, a sage-moss green soft short wool cape draping around round shoulders, tan lining visible in the tiny front opening, folded collar and one small acorn fastener, distinct gentle draped folds and curved lower edge; BACK is closed cape cloth over rounded shoulders, only a center seam and soft folds, NO clasp or front opening. Column 3: coral-dress, a dusty peach-coral pinafore dress, short bodice with tiny cap sleeves, cream Peter Pan collar, gently pleated flared short skirt and scalloped cream hem, tiny front bow; BACK has a little rear button placket and rear skirt folds, NO front bow. Every outfit has dimensional dark neck/cuff opening interiors, subtle cloth texture, soft cloth thickness and visible stitched construction. Only clothing shells, no body parts. Fill around 72% of cell, centered.
```

</details>

<details>
<summary>feet 图集：exec-dd23aaa4-5cef-432e-8c1a-8e1084dfb796.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine fabric grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. These assets will be worn by tiny, chubby, very round fuzzy animals. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in the appropriate on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no letters, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK must show appropriate rear seams and no FRONT-facing ties/buttons unless naturally present. No objects cross cell boundaries.
EXACTLY THREE columns by TWO rows: six cells in a wide 1536x1024 atlas. Each cell contains ONE PAIR of identical matching very tiny animal shoes side by side, mildly outward turned, viewed slightly from above so each has a visibly hollow dark foot opening, thick rim and dimensional sole. The pair should look as if little rounded paws are INSIDE when worn, but show NO paws here. Column 1 rain-boots: short muted ochre yellow rubber boots, small brown sole, rolled upper cuff, subtle rain droplet emblem on outer side, soft sheen and worn matte texture. Column 2 shell-shoes: pale ivory-blue mary-jane shoes with scallop-shell shaped toe caps, dusty blue thin sole and cream straps over dark hollow openings, tiny shell grooves. Column 3 leaf-slippers: sage green leaf-shaped soft open slippers, raised leaf vein straps curving across the opening, moss green thick softly rolled sole, warm cream interior, rounded not pointed toy silhouette. Bottom row true rear views of corresponding pair showing heel seams and raised rear rims, no toes facing the camera, both footwear remain a matching pair. Not four individual shoes per cell. Complete shoes, no detached separate soles, no water, no decorative objects. Fill 72% cell width.
```

</details>

<details>
<summary>bag 图集：exec-be2fc2bc-17d2-4fff-b6bb-a62d34175675.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine fabric grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. These assets will be worn by tiny, chubby, very round fuzzy animals. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in the appropriate on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no letters, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK must show appropriate rear seams and no FRONT-facing ties/buttons unless naturally present. No objects cross cell boundaries.
EXACTLY THREE columns by TWO rows: six cells in a wide 1536x1024 atlas. One small solid bag body per cell, NO long shoulder straps because straps are drawn separately in the game. Two SMALL attachment loops/rings or short strap stubs on the bag are allowed. Column 1 leaf-backpack: dimensional rounded sage green linen backpack, leaf-shaped folded flap with leaf veins, tan acorn wooden clasp, curved soft gussets and stitched edges, small short top handle; front view shows flap/clasp, back view shows smooth fabric back panel with two tiny upper attachment tabs, NO front flap/clasp on rear. Column 2 shell-pouch: pale warm cream and peach scallop-shell round crossbody pouch, softly padded shell ribs, tiny brass side attachment rings, gentle lilac lining at top, bottom gusset; rear view plainer cream reverse shell surface with rear seam, no front shell clasp. Column 3 bottle-bag: a small flattened sea-glass mint blue bottle-shaped canteen bag in a tan woven sling base, tan cork cap, tiny amber message scroll visible inside translucent glass, leather side attachment rings; back shows believable glass back and basket base. Stand-alone purse/bag body only, no wearers or long straps. Hand-painted material texture and upper-left light. Fill 68-76% cell, true alpha holes in handle.
```

</details>

<details>
<summary>hand 图集：exec-b803d248-4c9e-4074-b9bf-6b075e0b0395.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine material grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in its on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK shows appropriate rear seams and no front decorations. No objects cross cell boundaries.
EXACTLY THREE columns by TWO rows: six cells in a wide 1536x1024 atlas. One complete mini handheld prop in each cell, each with a slender straight handle visibly extending downwards to be grasped by a tiny paw in the game. No paw here. Column 1 tiny-net: small warm honey wooden fishing net with round muted sage hoop and delicate cream woven net mesh with transparent holes, slightly tilted hoop, slender wood stick. Column 2 clover-umbrella: cute miniature umbrella canopy formed from THREE plump sage green clover leaf lobes, ivory inner fabric beneath, fine leaf veins, slender tan wooden shaft and a tiny curved wooden grip; canopy clearly convex domed, genuinely underside shaded, three-leaf clover not four. Column 3 star-wand: tiny warm gold five-pointed star with cream pearl in its center, mounted on a thin caramel wooden wand, two little dusty blue ribbon streamers, painterly metallic highlights, no glow on background. All three props one complete connected object including handle. Bottom row corresponding backside of each same prop, no front pearl on rear of star, correct back of umbrella. Each cell keep full prop 70% of cell height. No item cut off.
```

</details>

<details>
<summary>head 图集：exec-3f32e972-a9c0-4f24-ad99-b101cf032726.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine material grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in its on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK shows appropriate rear seams and no front decorations. No objects cross cell boundaries.
EXACTLY FOUR columns by TWO rows: eight equal cells in a wide atlas. One complete small wearable headpiece per cell, designed to sit on the curved dome of a very chubby pet's head, viewed straight-on with a slight elevated view. Column 1 lily-pad: one fresh sage green cupped lily-pad leaf cap, one tiny curled stem, notch and delicate veins, a dimensional softly curled edge, NO flower. Column 2 reed-bow: an elegant woven pale sage reed ribbon bow, two rounded fabric loops with shadowed interiors, warm raffia knot and two short curled tails, clear natural material texture. Column 3 straw-hat: tiny warm ochre woven straw sunhat, shallow rounded crown and curving wide oval brim with a lifted front edge and dark undersurface, muted sage ribbon band and a tiny stitch, no flowers. Column 4 shell-crown: a tiny crown of FIVE alternating small ivory and blush pink seashells on a thin warm pale-gold curved circlet, middle shell highest, dimensional shell grooves and velvet-soft pearl highlights. Bottom row true BACK of these same headpieces: lily leaf rear stem and folded edge, reed bow rear knot/loops, straw hat back of brim/crown with no invented face, shell crown shows smooth shell backs and circlet reverse. No ears, heads, bodies, eyes. No separate floating fragments. Fill around 76% of each cell width.
```

</details>

<details>
<summary>hair 图集：exec-5b7dc4f5-5507-4373-be52-dd02b2ceb846.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine material grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in its on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK shows appropriate rear seams and no front decorations. No objects cross cell boundaries.
EXACTLY THREE columns by TWO rows: six cells in wide 1536x1024 atlas. One complete small plush-pet WIG in each cell. Front wigs must have a VERY LARGE EMPTY TRANSPARENT FACE OPENING: only a narrow arched strip of hair over forehead plus hair beside cheeks; no central hair curtain covering the eyes, no skin or dummy head, not a solid circular filled helmet. Carefully painted fine hair strands, warm soft volume, smooth contour, rounded cute proportions. Column 1 acorn-bob: chestnut brown short gently curled bob, little curved fringe strip, two soft side curls framing the open face, no bangs covering eyes; BACK full round chestnut bob with subtle curled ends and crown part. Column 2 cloud-bun: creamy beige hair, narrow fluffy curved fringe strip and TWO small round cloud-like side buns with a tiny ivory ribbon each, huge transparent face opening; BACK rounded cream hair cap with same two side buns, no fringe or face opening in back. Column 3 sea-braid: dusty sea-blue/grey hair, slim side-swept curved forehead fringe, TWO small low soft braided pigtails with cream end ties, huge transparent face opening; BACK gently domed blue-grey hair cap with middle part and same TWO braids. Front must be a hollow inverted U hairstyle around the future pet face. Wigs only, no ears, no animal face, no neck, no ornaments except the tiny specified hair ties. Every front/back pair same color, scale and haircut; center inside cell with 10% transparent gutter.
```

</details>

<details>
<summary>charm 图集：exec-8a6a9188-7831-4638-bc6f-6791fd19d1a6.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine material grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in its on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK shows appropriate rear seams and no front decorations. No objects cross cell boundaries.
EXACTLY FOUR columns by TWO rows: eight equal cells in wide atlas. One very small delicate solid wearable charm or brooch per cell, not a flat emoji/icon. Column 1 bubble-star: translucent pale aquamarine round bubble pendant with a tiny warm butter-yellow star inside and a small bronze suspension loop at the top, subtle edge highlights and refraction. Column 2 pearl-badge: one lustrous warm ivory pearl set into a tiny dusty blush scallop shell brooch with warm gold edging and a small pale blue ribbon tab below, painted volume and soft pearlescence. Column 3 clover-pin: THREE thick softly curved sage green heart-shaped clover leaflets on a short curved brown-green stem with a tiny warm bronze pin mount, leaf veins and folded leaf depth. Column 4 glow-jelly: tiny soft lavender/aquamarine jellyfish pendant, rounded translucent domed bell with scalloped rim, three short curled tentacles, small top suspension loop, delicate pearly shine, NO cartoon eyes/face, NO glow cast on background. Bottom row true matching back views: metal brooch backs with a tiny pin bar where relevant, bubble smooth reverse without a second front star pasted on, jellyfish reverse dome and same tentacles. Keep tiny charming detail, upper-left soft illumination, no hard black outlines or floor. Fill 60-70% cell.
```

</details>

<details>
<summary>legacy 图集：exec-4e37372b-5ea5-4aed-b77a-7fb077f20b40.png</summary>

```text
Use case: stylized-concept. Production GAME WEARABLE SPRITE ATLAS with a genuinely transparent alpha background. The attached pet sprites are STYLE AND SCALE REFERENCE ONLY; NEVER reproduce any creature or body. Match the pets' exquisite soft hand-painted fairy-tale illustration: delicate warm-brown fine contours, fine material grain and small painterly highlights, soft upper-left lighting, rounded volume, warm ambient occlusion at seams and openings. Believable miniature clothing/props, not flat vector symbols, CSS shapes, stickers, photographic garments, or glossy 3D plastic. Each garment/prop appears alone, unsupported, in its on-body worn silhouette, with no mannequin, no body, no fur, no skin, no face, no paws, no floor, no ground shadows, no labels, no words, no grid lines, no checkerboard, no opaque background. Strict equal cell grid, ample transparent gutters, one complete specified asset per cell, same size/design for front and back. Top row straight FRONT views, bottom row matching true BACK views in the SAME column order. Designs must be front/back consistent; BACK shows appropriate rear seams and no front decorations. No objects cross cell boundaries.
EXACTLY TWO columns by TWO rows: four equal cells on one square 1024x1024 atlas. These are extra matching tiny wearable accessories for the same round fuzzy pets. Column 1 legacy-scarf: soft moss sage knitted miniature scarf in a very squat wide curved ring shape that wraps under a round chin, one small side knot and two very short draping tails, real knit texture, softly shadowed folded inner edge, tiny hanging fringes; BACK view shows same scarf's plain curved knitted rear band, NO front knot/tails. No neck or body. Column 2 legacy-flower: one tiny butter yellow five-petal daisy hair flower, warm honey center, subtle soft cream petal shadows and one sage leaf with a short fine clip; BACK view shows small green sepal and the bronze hair clip, backside of same flower, not another front flower. No head, no skin, no hands, no detached floating extras. Full complete items, centered in equal cells with transparent 12% gutters.
```

</details>

## 按物种替换衣身（2026-10-19，用户二次指出贴片问题后重做）

用户在实际衣柜正面和背面再次指出：上一版通用衣服仍像贴在宠物身前，尺寸和身体不符。因此，前一节的材质生成与锚点调整保留为历史记录，不能作为本轮“真正穿上”的验收依据。本轮处理的根因是完整裸身与通用衣服同时存在：即使贴图有布纹、爪子压在上面，裸腹外轮廓仍会与衣身形成两圈轮廓。新的衣服按四种原宠物各自的肩、短躯干、腰臀和正背面生成，使用整段着装躯干替换原裸身下半部，再接回原来的头和松鼠尾巴。

四组图均使用 **内置 ImageGen 的本地原图编辑模式**，明确 `transparent_background: true`，分别引用对应的 `src/static/pets/<species>-atlas.png`，没有引入或下载外网服装素材。生成时画完整角色，以约束服装贴合和毛爪出袖口；生成出的头与大尾巴仅用于参考，不进入最终角色的头部/尾部。每张源图是 1536×1024 的三列两行图集：列为水手衫、苔绿斗篷、珊瑚裙，上行为正面，下行为真背面。

运行时仍以原帧 **144×176** 为坐标空间。registration 按每张源图的领口锚点、实际裁框和缩放量登记着装躯干边界及爪子/脚部位置，不把同一通用衣壳拉伸覆盖四种宠物。原头 atlas 保留原列和正背行，按各耳型/伞型的 `headBottom` 边界只裁下方 alpha，裁切边缘使用 8×8 子像素覆盖率；保留像素的 RGB 逐字节不变，内部 alpha 不变。松鼠尾巴从原 atlas 独立拆图，同样不重绘、不改 RGB，正面在衣身后，背面在衣身前、头后；裁去原裸身、旧爪和旧脚带，避免再露第二层身体。原始四张基础 atlas 不覆盖。

衣身源图只按记录的裁框截取、缩放和保留透明边界，并压成带多级 alpha 的 256 色索引 PNG；不把完整生成角色直接替换原身份。头和尾采用无损 RGBA PNG，不能按衣身的调色板流程重新量化。未更改物品 ID、七个部位、价格、首通奖励、存档、业务字段、路由或服务接口。

最终运行资源统一保存于 `D:/团队项目/group-project/src/static/pets/tailored/`；以下列出新增文件。表中的文件名均相对于该目录。

| 物种 | 衣身文件（均含正背） | 文件数 | 字节 |
| --- | --- | --- | --- |
| 糯叶兔 | `rabbit-sailor-shirt-front.png`、`rabbit-moss-cape-front.png`、`rabbit-coral-dress-front.png`、`rabbit-sailor-shirt-back.png`、`rabbit-moss-cape-back.png`、`rabbit-coral-dress-back.png` | 6 | 80,958 |
| 栗团水豚 | `capybara-sailor-shirt-front.png`、`capybara-moss-cape-front.png`、`capybara-coral-dress-front.png`、`capybara-sailor-shirt-back.png`、`capybara-moss-cape-back.png`、`capybara-coral-dress-back.png` | 6 | 117,861 |
| 森芽菇 | `mushroom-sailor-shirt-front.png`、`mushroom-moss-cape-front.png`、`mushroom-coral-dress-front.png`、`mushroom-sailor-shirt-back.png`、`mushroom-moss-cape-back.png`、`mushroom-coral-dress-back.png` | 6 | 49,044 |
| 铃果松鼠 | `squirrel-sailor-shirt-front.png`、`squirrel-moss-cape-front.png`、`squirrel-coral-dress-front.png`、`squirrel-sailor-shirt-back.png`、`squirrel-moss-cape-back.png`、`squirrel-coral-dress-back.png` | 6 | 60,645 |

| 原图无损拆图 | 来源 | 字节 |
| --- | --- | --- |
| `rabbit-heads.png` | `D:/团队项目/group-project/src/static/pets/rabbit-atlas.png` | 120,730 |
| `capybara-heads.png` | `D:/团队项目/group-project/src/static/pets/capybara-atlas.png` | 80,874 |
| `mushroom-heads.png` | `D:/团队项目/group-project/src/static/pets/mushroom-atlas.png` | 73,058 |
| `squirrel-heads.png` | `D:/团队项目/group-project/src/static/pets/squirrel-atlas.png` | 42,636 |
| `squirrel-tails.png` | `D:/团队项目/group-project/src/static/pets/squirrel-atlas.png` | 53,933 |

新增衣身 **24 张、308,508 字节**；原头/尾拆图 **5 张、371,231 字节**；另有松鼠开襟斗篷腹毛分离图 **1 张、5,576 字节**，合计 **30 张 PNG、685,315 字节**。这些是本次新增量，不与上一节 50 张通用配饰重复合计。所有着装源图检查了真 alpha，四角为 0；主体主要为 253、最高 254，保留渐变毛边。资源尺寸和 alpha 检查不等同于最终视觉验收或微信真机验收，最终实际验证另见 verification.md。

兔子珊瑚裙背面在图集裁切右上角留下一条与衣身分离的7像素参考耳尖，经连通域检查确认后清除其alpha；服装、尾球和原头未重画。最终该衣身PNG为14,425字节，清理后的资源与实际H5正背截图已复核。

`src/static/pets/tailored/squirrel-moss-cape-front-fur.png`（160×93）从同名专属衣身的开襟腹部确定性分离：保留原像素RGB与纹理，按橙色/奶油毛与橄榄绿布料的颜色差异及腹部区域建立透明遮罩，保留柔和alpha。此图与衣身同坐标，专供毛色滤镜，避免给衣料染色或贴上圆形肤色块；不是额外生成的宠物部件。其余新毛爪/兔尾仍使用同源局部着色，全部跟随同一144×176注册帧。

源图、完整提示词和裁切清单仅在外部工作目录留档，项目运行只引用上述 `src/static/pets/tailored/` 最终 PNG：

- 原工作目录：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/`。
- 兔源图：`C:/Users/Lenovo/.codex/generated_images/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/exec-483cb6b8-9562-4ce4-9e47-a7bb81ce8329.png`；提示词：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-rabbit-prompt.txt`。
- 三物种完整源图：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-art/capybara-tailored-reference-v1.png`、`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-art/mushroom-tailored-reference-v1.png`、`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-art/squirrel-tailored-reference-v1.png`。原始内置工具输出文件见下列各组提示词的源图记录。
- 三物种生成输入与整格坐标：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-art/species-generation-input.json`、`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-art/species-art-manifest.json`。
- 衣身裁框与锚点：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-source-crops.json`；最终文件、字节与 registration：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-art-manifest.json`。
- 原头/尾拆图边界与无损记录：`C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/tailored-heads-manifest.json`。

<details>
<summary>糯叶兔专属衣身：exec-483cb6b8-9562-4ce4-9e47-a7bb81ce8329.png</summary>

```text
Use case: identity-preserve.
Asset type: production 2D game pet wardrobe try-on atlas. Edit target: attached rabbit-atlas.png, the ORIGINAL rabbit identity, wool texture, outlines and proportions. Build a new sheet with EXACTLY THREE columns and TWO rows of the SAME floppy-eared bunny shown in column 1 of the reference, front row true front view, lower row true BACK view. DO NOT USE upright or short-ear variants. Every cell equal size, full whole bunny from long ear tips to original bare paws, aligned at same original scale and standing pose in all six cells, ample transparent gutters, true alpha background.
Primary request: Repaint its THREE garments AS IF THE BUNNY IS ACTUALLY WEARING THEM, all around its round body. Column 1 a cream miniature sailor shirt with muted indigo collar and fine blue cuff stripes and small front blue bow. Column 2 a moss-sage soft cloth cape fastened under chin with tiny ivory clasp, curving around shoulders, barrel torso, down to hips, front opening shows very little cream fur. Column 3 a dusty coral and peach tiny dress with shoulder sleeves, fitted softly around round torso then natural pleated skirt around belly down to hips.
Critical fit: garment begins directly UNDER CHIN and wraps over BOTH shoulders and entire round belly and sides, to just ABOVE the original feet. NO naked belly border visible around outside garment, NO detached clothing, NO long neck. Upper arms INSIDE sleeves, small original furry paw tips emerge naturally from cuffs and rest in front of chest. Clothing replaces the belly silhouette, not a smaller sticker over belly. Back views cloth entirely covers round back, shoulder seams continuous, no front bow on back, small cream bunny pompom emerges through a real opening in lower back seam. No duplicate naked body outline below hem. Maintain original bare paws positions, head identity, EXACT head size, floppy ears, smile, eyes, blush, fur shape and all three garments must be sized on SAME BODY.
Style: identical delicate warm brown contours, soft hand painted storybook fur and watercolor fabric, upper-left light, dimensional cloth folds flowing with round anatomy, tiny contact shadow under chin and around cuff/hem. Match input illustration, no change into a new bunny character.
Transparent background, no floor, no text, no grid, no labels, no other accessories, no hats, no hair, no bags, no shoes, no held items, no scenery, no bodyless garments. Avoid doll clothes floating in front, human proportions, detached sleeve holes, photorealistic cloth, glossy plastic.
Composition: canvas wide 1536x1024 or square as needed with regular 3x2 grid. Each cell has ONE full dressed bunny, not clothing inventory icons. Top row front three outfits, bottom matching rear three outfits. Preserve face and head as reference.
```

</details>

<details>
<summary>栗团水豚专属衣身：exec-6607d30d-018d-46ce-a36d-861fca16d999.png</summary>

原图编辑目标：`D:/团队项目/group-project/src/static/pets/capybara-atlas.png`。内置工具原始输出：`C:/Users/Lenovo/.codex/generated_images/01a15211-a943-7511-8987-0b537e101442/exec-6607d30d-018d-46ce-a36d-861fca16d999.png`。

```text
Use case: identity-preserve. Asset type: transparent hand-painted game character clothing sprite reference sheet.
Input image is the EDIT TARGET / identity and body-proportion source. Produce a NEW matching 3-column by 2-row sheet of six complete characters of the exact golden caramel fluffy capybara in the supplied atlas: very broad round pear belly, squat seated body, round tiny ears, broad oval muzzle, two tiny brown feet; NO tail visible, actually WEARING clothes tailored to their existing animal anatomy.
Layout: exact regular 3×2 equal cell grid, no dividers, 1536×1024 landscape preferred, each full character centered in its cell, same character size and original sitting pose, generous transparent cell padding, no overlaps. Top row all FRONT facing camera, bottom row TRUE BACK fully turned away with zero face. Columns LEFT = ivory sailor shirt with navy fitted collar, navy cuff piping and a tiny front navy knot; MIDDLE = moss-green soft wrap cape tied under chin, back one uninterrupted green drape to hips; RIGHT = coral-peach short frilled dress with tiny gathered bodice and skirt, back matching clothing and neat back bow.
CRITICAL CLOTH FIT: The sailor SHIRT must be wide and plump like this broad capybara torso, wrapping both sides from shoulders just under the head to the hips. Sleeves fully envelop the upper arm roots but the two existing furry small paws rest naturally on top of the sleeves/chest. The moss-green cape wraps both flanks and back of its round body, fastened directly at the neck. The coral dress forms a believable short bell silhouette OVER the broad belly and hips with fabric tension, not a separate tiny human dress pasted on the cream oval.
The clothing REPLACES the naked torso silhouette; do not draw an exposed second naked tummy or bare-body outer ring behind the clothes. Cover the torso sides all the way to actual body silhouette and waist/hip edge. Fitted collars are in contact with under-chin fur. Sleeves wrap upper arms, NOT merely little cuff stickers at paw tips. Fur paws project naturally out of sleeve openings. Cloth has believable folds, curved seams, thickness, shadows under collar and cuffs. Bottom hem wraps the hips above the exact same two original exposed tiny feet. Keep original fur head, eye shape, ear/cap shape, proportions, pose, foot placement, tiny arms and tail unchanged; DO NOT prettify or redesign identity. Six matching character illustrations, not flat garments.
Style: same fine warm brown outline, soft detailed fluffy fur edges, gentle golden storybook watercolor shading as original. Limited original warm cream/sage/coral palette. Transparent actual alpha background, NO ground shadow, NO scene, NO lettering, NO labels, NO accessories, no extra hat/headwear, shoes, bags, jewelry, objects or hand props, no human body, no long limbs.
```

</details>

<details>
<summary>森芽菇专属衣身：exec-549baae1-0df2-4b30-9d0a-a679d3fabff9.png</summary>

原图编辑目标：`D:/团队项目/group-project/src/static/pets/mushroom-atlas.png`。内置工具原始输出：`C:/Users/Lenovo/.codex/generated_images/01a15211-a943-7511-8987-0b537e101442/exec-549baae1-0df2-4b30-9d0a-a679d3fabff9.png`。

```text
Use case: identity-preserve. Asset type: transparent hand-painted game character clothing sprite reference sheet.
Input image is the EDIT TARGET / identity and body-proportion source. Produce a NEW matching 3-column by 2-row sheet of six complete characters of the exact tiny ivory cream mushroom forest creature in the supplied atlas: large sage green yellow-speckled ROUND mushroom cap with ivory gills, extremely small squat pear-shaped cream body below cap, two small round cream paws touching near chest, tiny dark brown feet. Use rounded cap of LEFT column only, actually WEARING clothes tailored to their existing animal anatomy.
Layout: exact regular 3×2 equal cell grid, no dividers, 1536×1024 landscape preferred, each full character centered in its cell, same character size and original sitting pose, generous transparent cell padding, no overlaps. Top row all FRONT facing camera, bottom row TRUE BACK fully turned away with zero face. Columns LEFT = ivory sailor shirt with navy fitted collar, navy cuff piping and a tiny front navy knot; MIDDLE = moss-green soft wrap cape tied under chin, back one uninterrupted green drape to hips; RIGHT = coral-peach short frilled dress with tiny gathered bodice and skirt, back matching clothing and neat back bow.
CRITICAL CLOTH FIT: Maintain the original huge cap and very TINY short body ratio. Clothes have no human neck or human shoulders. Sailor shirt wraps the ENTIRE small mushroom torso immediately under the cap, gently following its round pear sides from under-cap shoulders to its tiny hips. Exposed cream paws emerge from tiny sleeves, do NOT remain floating in front of a bare oval belly. Cape hugs the tiny body with fabric wrap behind, front closure directly under mushroom cap. Dress drapes from just under cap to tiny feet, containing the belly with one cloth outline.
The clothing REPLACES the naked torso silhouette; do not draw an exposed second naked tummy or bare-body outer ring behind the clothes. Cover the torso sides all the way to actual body silhouette and waist/hip edge. Fitted collars are in contact with under-chin fur. Sleeves wrap upper arms, NOT merely little cuff stickers at paw tips. Fur paws project naturally out of sleeve openings. Cloth has believable folds, curved seams, thickness, shadows under collar and cuffs. Bottom hem wraps the hips above the exact same two original exposed tiny feet. Keep original fur head, eye shape, ear/cap shape, proportions, pose, foot placement, tiny arms and tail unchanged; DO NOT prettify or redesign identity. Six matching character illustrations, not flat garments.
Style: same fine warm brown outline, soft detailed fluffy fur edges, gentle golden storybook watercolor shading as original. Limited original warm cream/sage/coral palette. Transparent actual alpha background, NO ground shadow, NO scene, NO lettering, NO labels, NO accessories, no extra hat/headwear, shoes, bags, jewelry, objects or hand props, no human body, no long limbs.
```

</details>

<details>
<summary>铃果松鼠专属衣身：exec-66b025c4-519b-41b4-94e8-32cb04125179.png</summary>

原图编辑目标：`D:/团队项目/group-project/src/static/pets/squirrel-atlas.png`。内置工具原始输出：`C:/Users/Lenovo/.codex/generated_images/01a15211-a943-7511-8987-0b537e101442/exec-66b025c4-519b-41b4-94e8-32cb04125179.png`。

```text
Use case: identity-preserve. Asset type: transparent hand-painted game character clothing sprite reference sheet.
Input image is the EDIT TARGET / identity and body-proportion source. Produce a NEW matching 3-column by 2-row sheet of six complete characters of the exact warm chestnut-orange fluffy squirrel in the supplied atlas: POINTED ears and 3 little forehead tufts (LEFT column only), cream face and cream pear belly, enormous curled bushy orange tail on viewer LEFT when facing front and viewer LEFT on the reference back; small orange paws at the chest and tiny brown feet, actually WEARING clothes tailored to their existing animal anatomy.
Layout: exact regular 3×2 equal cell grid, no dividers, 1536×1024 landscape preferred, each full character centered in its cell, same character size and original sitting pose, generous transparent cell padding, no overlaps. Top row all FRONT facing camera, bottom row TRUE BACK fully turned away with zero face. Columns LEFT = ivory sailor shirt with navy fitted collar, navy cuff piping and a tiny front navy knot; MIDDLE = moss-green soft wrap cape tied under chin, back one uninterrupted green drape to hips; RIGHT = coral-peach short frilled dress with tiny gathered bodice and skirt, back matching clothing and neat back bow.
CRITICAL CLOTH FIT: Preserve the original large curled tail, shoulders, very short pear torso and tiny feet positions. Shirt fabric wraps the pear torso from under the head to hips, with fitted tiny sleeves containing upper arms and exposed furry paws. Cape fastened under neck wraps both shoulders/body; tail exits from a discreet slit and sits behind the cape in front view, and in front/side of cape in back view, preserving its outline. Coral dress genuinely fits around the belly with visible side seams and skirt volume around hips; tail remains outside dress naturally.
The clothing REPLACES the naked torso silhouette; do not draw an exposed second naked tummy or bare-body outer ring behind the clothes. Cover the torso sides all the way to actual body silhouette and waist/hip edge. Fitted collars are in contact with under-chin fur. Sleeves wrap upper arms, NOT merely little cuff stickers at paw tips. Fur paws project naturally out of sleeve openings. Cloth has believable folds, curved seams, thickness, shadows under collar and cuffs. Bottom hem wraps the hips above the exact same two original exposed tiny feet. Keep original fur head, eye shape, ear/cap shape, proportions, pose, foot placement, tiny arms and tail unchanged; DO NOT prettify or redesign identity. Six matching character illustrations, not flat garments.
Style: same fine warm brown outline, soft detailed fluffy fur edges, gentle golden storybook watercolor shading as original. Limited original warm cream/sage/coral palette. Transparent actual alpha background, NO ground shadow, NO scene, NO lettering, NO labels, NO accessories, no extra hat/headwear, shoes, bags, jewelry, objects or hand props, no human body, no long limbs.
```

</details>

## 天然发根与包脚鞋（2026-10-20，按原头型与原脚重做）

提交团队仓库时，七份完整提示/提取JSON及五张验收截图已整理到 [仓库内交付证据](assets/pets-2026-10-20/README.md)，下方对应清单链接可由队友直接打开。完整生成原图、工作副本与早期联系图仍是作者机器的归档路径；它们不随仓库上传，也不是前端运行依赖。新旧运行PNG均随源码交付。

用户在实际衣柜中继续指出：发型仍像戴上的假发、鞋子像放在脚前，要求发根贴合原头型、原脚真正进入鞋中。本轮按四物种分别生成短发、低发髻、短辫与实际穿鞋参考，提取需要的局部，而非给通用假发和空鞋再次调大或调小。前面的通用配饰、衣身重做记录继续作为历史，不能代替本轮验证。

本轮共 **8 张实际生成源图**：四物种各一张发型图、一张穿鞋图。均使用 **内置 ImageGen 引用原图编辑**，输入对应的原始 `<species>-atlas.png`，提示词要求保留角色身份，并设置 `transparent_background: true`。没有使用 API/CLI 回退或新增依赖。以下工作副本保留原始透明通道，仅供提取和溯源；完整生成角色不作为运行时新宠物：

| 源图 | 像素尺寸 | 实际生成来源与工作副本 |
| --- | --- | --- |
| 糯叶兔发型 | 1374×1145 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575d-fbe1-7c23-817b-019725f6df2e/exec-d10d993b-4775-4e14-b354-18817b7910c8.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/natural-hair-art/rabbit-hair-reference-v1.png) |
| 栗团水豚发型 | 1374×1145 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575d-fbe1-7c23-817b-019725f6df2e/exec-5f55595b-c682-4f02-a698-151a04bb01ed.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/natural-hair-art/capybara-hair-reference-v1.png) |
| 森芽菇发型 | 1374×1145 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575d-fbe1-7c23-817b-019725f6df2e/exec-d5d2f405-de68-4fd6-9868-78d90077f18c.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/natural-hair-art/mushroom-hair-reference-v1.png) |
| 铃果松鼠发型 | 1374×1145 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575d-fbe1-7c23-817b-019725f6df2e/exec-5cf356a9-4eba-4b9e-9d9d-afa19eab5001.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/natural-hair-art/squirrel-hair-reference-v1.png) |
| 糯叶兔鞋 | 1390×1132 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575e-84d0-7a40-b86e-1263a9bbdb0e/exec-fefd0236-bd90-4043-9a00-241ef2bcf319.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/fitted-shoes-art/rabbit-shoes-reference-v1.png) |
| 栗团水豚鞋 | 1536×1024 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575e-84d0-7a40-b86e-1263a9bbdb0e/exec-af0c0ae7-d664-407f-9dc9-022a47a40a75.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/fitted-shoes-art/capybara-shoes-reference-v1.png) |
| 森芽菇鞋 | 1536×1024 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575e-84d0-7a40-b86e-1263a9bbdb0e/exec-e2beb0e3-ade2-4dbc-a104-3269b6113ec6.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/fitted-shoes-art/mushroom-shoes-reference-v1.png) |
| 铃果松鼠鞋 | 1536×1024 | [内置工具原始图](C:/Users/Lenovo/.codex/generated_images/01a1575e-84d0-7a40-b86e-1263a9bbdb0e/exec-4f601c53-4581-4471-8667-b9f2688003df.png)；[工作副本](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/fitted-shoes-art/squirrel-shoes-reference-v1.png) |

发型源图为三列两行：橡果短发 `acorn-bob`、云朵低发髻 `cloud-bun`、海风短辫 `sea-braid`，上正面、下真背面。本次均采用细暖棕色发丝与原绘本毛绒笔触，缩短额发、侧发和辫子，发根顺着各物种真实头骨曲线进入毛发；保留双眼和耳根，背面沿后脑曲线贴合。森芽菇的头发只位于原蘑菇帽檐下的额头/后颈，不能把头发画在绿伞帽表面。

生成过程存在脸部细节或兔背耳色轻微漂移，因此最终只按多边形、颜色阈值和记录的锚点提取发丝 alpha，不复制生成脸、耳、帽、身体、爪或尾巴。原宠物身份继续来自项目原 atlas 及已有原图拆分；发型边缘的半透明发丝保留，提取不构成“换了一个更像参考图的新角色”。

鞋源图同样三列两行：雨点靴 `rain-boots`、贝壳鞋 `shell-shoes`、叶子拖鞋 `leaf-slippers`，上正面、下真背面。先在原短腿、脚距和站姿上画成实际穿鞋，再逐只裁取鞋与极短毛踝。雨靴筒口、贝壳鞋口和叶面固定带由毛脚填住；前面显示鞋头，背面显示鞋后跟与原腿的连接，不能用正面镜像充当背面。提取不包含大片腹毛或尾巴，也不保留空鞋洞。

运行时新增 **72 张 PNG**，保存到 `D:/团队项目/group-project/src/static/pets/fitted/`。24 张发型为四物种×三发型×正背面；48 张鞋为四物种×三款鞋×正背面×左右脚。文件命名分别为 `<species>-<hairId>-<view>.png` 和 `<species>-<shoeId>-<view>-<left|right>.png`。按实际文件复核的字节如下，不含外部完整参考图、历史配饰或试制图片：

| 物种 | 发型 PNG | 发型字节 | 鞋 PNG | 鞋字节 |
| --- | --- | --- | --- | --- |
| 糯叶兔 | 6 | 78,514 | 12 | 91,635 |
| 栗团水豚 | 6 | 44,882 | 12 | 93,588 |
| 森芽菇 | 6 | 17,666 | 12 | 83,163 |
| 铃果松鼠 | 6 | 50,848 | 12 | 76,735 |
| 合计 | 24 | 191,910 | 48 | 345,121 |

本轮这 72 张运行资源合计 **537,031 字节**。透明局部使用现有 256 色索引 PNG 工具保留多级 alpha；鞋资产 48 张均已重新解码，确认透明和半透明像素存在。发型 24 张的最终最少 alpha 层级为 77，最大边为 226 像素；提取阈值、alpha 与输出尺寸见下列最终清单。最终九特征走查发现立耳兔会露出一小段误入的垂耳棕线，已只清理该图156个可见像素，位置、尺寸和正常发髻保留，文件减少198字节；[清理核验记录](assets/pets-2026-10-20/rabbit-bun-ear-clean.json)。尺寸/alpha 检查用于确认素材完整性，实际衣柜和广场的拟合效果、构建与微信端边界以本轮 verification.md 的实际记录为准。

所有局部以原 **144×176** 帧登记 `bounds`。发型登记源锚点和目标锚点；左右鞋分别按各自原脚中心定位，保持鞋图长宽比，鞋宽仅略包住原脚，鞋底统一接 `y171`，不通过拉扁一整双鞋强行迁就脚距。注册表只存默认物种特征坐标：糯叶兔非垂耳特征由组件统一加 `dx12`，森芽菇宽帽特征统一加 `dx4`，不在各鞋/发型文件里重复应用偏移。穿鞋时由原生局部裁窗隐藏原裸脚，并关闭旧毛踝回盖，避免鞋外再出现第二只裸脚。

本轮没有采用试制的四张“整张去脚 atlas”；它们不属于最终运行资源，也不计入上述 72 张与字节统计。原始四张基础 atlas 保持原样。

完整提示词与每张实际工具输出路径保存在以下外部文件；这些是生成与裁切证据，项目运行只引用 `src/static/pets/fitted/` 的最终 PNG：

- [四物种发型完整提示词、生成来源、透明度记录](assets/pets-2026-10-20/natural-hair-generation.json)。
- [发型源裁框、提取多边形、阈值、锚点、实际输出](assets/pets-2026-10-20/fitted-hair-manifest.json)；[发型运行坐标注册表](assets/pets-2026-10-20/fitted-hair-registry.json)。
- [四物种鞋完整提示词、生成来源、六格坐标与透明度记录](assets/pets-2026-10-20/shoes-prompts-manifest.json)。
- [左右脚裁框、实际 PNG 尺寸、字节与默认 bounds](assets/pets-2026-10-20/fitted-shoes-parts-manifest.json)；[鞋运行坐标注册表](assets/pets-2026-10-20/fitted-shoes-registry.json)。
- [24 套鞋与原身体联系预览](C:/Users/Lenovo/.codex/visualizations/2026/10/14/01a13a25-b0e8-7d03-8a72-e82e9b21fd33/phase-one-preview/fitted-shoes-art/fitted-shoes-contact-v1.png)。该联系预览只清掉原脚局部，保留腹底和松鼠尾尖；最终组件还需结合衣服、发型、包带等一起验收。
