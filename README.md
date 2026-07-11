# Unit Level Editor

通用的、以「**單位（unit）**」為共通語言的 2D 關卡編輯器。純前端、零依賴、單一 HTML + JS，
可直接架在 **GitHub Pages**。

不綁任何遊戲引擎：編輯器只認「單位座標」，**1 單位等於多少 px 由使用這份 JSON 的遊戲自己定義**。
你在這裡擺矩形與標記、標好類型與座標，匯出一份中性 JSON，遊戲端寫個薄轉接器就能吃。

## 為什麼不是 Tiled / draw.io / Obsidian 外掛

- **Tiled** 是 *tile 格子* 編輯器；本工具走「自由矩形 + 語意標記」，不逼你切格子。
- **draw.io** 是流程圖工具，語意型別無處放、還要維護 XML→JSON parser。
- **Obsidian 外掛** 得扛外掛框架，且遊戲通常不從 vault 讀關卡，好處用不到。

本工具就一件事：把「單位座標的關卡」畫出來、存成乾淨 JSON。

## 功能

- 單位格線 + 可調吸附（snap）、以游標為中心的滾輪縮放、中鍵/空白鍵平移
- **矩形**（地形/牆/尖刺…）與**點標記**（出生點/目標/鑰匙/開關…）兩種元素
- **類型調色盤**：類型 = 名稱 + 顏色 + 形狀，可自由增刪；語意由你的遊戲解讀
- 每個元素可掛**自訂屬性 `props`** 與**連動 `links`**（開關→門那種 targetId 關係，畫布上有箭頭）
- 精確數值編輯、拖曳移動/縮放、方向鍵微調、複製、復原/重做
- 匯入 / 匯出 JSON、下載 `.json`、localStorage 自動存檔

## 使用

直接開 `index.html` 即可（或 `python -m http.server` 起個本機伺服器）。線上版走 GitHub Pages。

## 輸出格式 `unit-level/v1`

```jsonc
{
  "format": "unit-level/v1",
  "name": "level-01",
  "world":  { "wUnit": 80, "hUnit": 20 },   // 世界大小（單位）
  "snap": 0.5,
  "spawnUnit": { "x": 3, "y": 15 },          // 出生點（單位，點）
  "types": [                                  // 類型定義（顏色/形狀，供還原調色盤）
    { "name": "ground", "color": "#5568d3", "shape": "rect" },
    { "name": "goal",   "color": "#4fd1c5", "shape": "point" }
  ],
  "elements": [
    // 矩形：帶 wUnit/hUnit，(xUnit,yUnit)=左上角
    { "id": "ground-1", "kind": "rect",  "type": "ground", "xUnit": 0, "yUnit": 18, "wUnit": 22, "hUnit": 2 },
    // 點：無 wUnit/hUnit
    { "id": "goal-1",   "kind": "point", "type": "goal",   "xUnit": 77, "yUnit": 3 },
    // 連動 + 自訂屬性
    { "id": "sw1", "kind": "point", "type": "switch", "xUnit": 20, "yUnit": 12,
      "props": { "once": "true" }, "links": ["door1"] }
  ]
}
```

**座標約定**：單位制；**Y 向下**（y 越大越靠下）；矩形以左上角為基準；點就是一個座標。

## 遊戲端怎麼吃

編輯器輸出是中性的，語意（哪個 type 算實心、哪個致死）由遊戲決定。範例轉接器見
[`examples/adapter.ts`](examples/adapter.ts)，示範把 `unit-level/v1` 轉成一個平台遊戲的
`solids / objects / hazards` 結構——換遊戲只要改那張對照表。

## 授權

MIT
