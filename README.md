# LevelCraft

通用的、以「**單位（unit）**」為共通語言的 2D 關卡編輯器。純前端、零依賴、單一 HTML + JS，
可直接架在 **GitHub Pages**。

不綁任何遊戲引擎：編輯器只認「單位座標」，**1 單位等於多少 px 由使用這份 JSON 的遊戲自己定義**。
你在這裡擺矩形與標記、標好類型與座標，匯出一份中性 JSON，遊戲端寫個薄轉接器就能吃。

## 為什麼不是 Tiled / draw.io / Obsidian 外掛

- **Tiled** 是 *tile 格子* 編輯器；本工具走「自由矩形 + 語意標記」，不逼你切格子。
- **draw.io** 是流程圖工具，語意型別無處放、還要維護 XML→JSON parser。
- **Obsidian 外掛** 得扛外掛框架，且遊戲通常不從 vault 讀關卡，好處用不到。

LevelCraft 就一件事：把「單位座標的關卡」畫出來、存成乾淨 JSON。

## 使用方式

線上版直接開 GitHub Pages 網址即可；本機用 `python -m http.server` 或任意靜態伺服器開 `index.html`
（`file://` 直接開也行，但部分瀏覽器的剪貼簿權限會受限）。

### 介面

三欄：**左**＝工具 + 類型調色盤 + 世界設定；**中**＝畫布；**右**＝選取元素屬性 + 元素清單。

### 基本流程

1. **設世界大小**（左下「世界設定」的寬 W／高 H，單位）。青色虛線框就是世界邊界。
2. **選類型**：左側調色盤點一下想放的類型（例 `ground`）。點矩形類型會自動切到「矩形」工具，
   點類型自動切到「標記」工具。
3. **放元素**：
   - 「▭ 矩形」工具：在畫布**拖曳**畫出地形／牆／尖刺等矩形。
   - 「◈ 標記」工具：**點一下**放出生點目標、鑰匙、開關等點物件。
   - 「⚑ 出生點」工具：點一下設定玩家出生點。
4. **調整**：用「▷ 選取」工具點元素 → 拖曳搬移、拖四角把手縮放；右欄可輸入精確 `x/y/w/h`。
5. **連動**：選一個開關類元素 → 右欄「連動 links」選目標（例某扇門）按「連」，畫布上會出現箭頭。
   遊戲端把它當 `targetId`。
6. **匯出**：右上「匯出 JSON」→ 複製或下載 `.json`。「匯入 JSON」可貼回既有關卡續編。

### 操作快捷鍵

| 操作 | 鍵 |
|------|----|
| 平移畫布 | 中鍵拖曳 或 空白鍵 + 左鍵拖曳 |
| 縮放（以游標為中心） | 滾輪 |
| 選取／矩形／標記工具 | `V` / `R` / `M` |
| 刪除選取 | `Delete` / `Backspace` |
| 複製選取 | `Ctrl/Cmd + D` |
| 微調位置（1 格） | 方向鍵；`Shift +` 方向鍵 = 5 格 |
| 復原 / 重做 | `Ctrl/Cmd + Z` / `Ctrl/Cmd + Y` |

### 類型調色盤

類型 = **名稱 + 顏色 + 形狀（矩形／點）**，就這樣，沒有內建語意。
按類型旁的 ✎ 可改名／改色／改形狀，或「＋ 新增類型」自建。**語意（哪個算實心、哪個致死）由你的遊戲決定**。

> 顯示設定裡的「px/單位」只影響螢幕縮放，**不會寫進 JSON**。編輯器內外一律用單位溝通。

自動存檔：內容即時存進瀏覽器 localStorage，重開分頁會接續（換機器不會跟著走，正式檔請自行匯出保存）。

## 輸出格式 `levelcraft/v1`

```jsonc
{
  "format": "levelcraft/v1",
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

編輯器輸出是中性的，語意由遊戲決定。範例轉接器見 [`examples/adapter.ts`](examples/adapter.ts)，
示範把 `levelcraft/v1` 轉成一個平台遊戲的 `solids / objects / hazards` 結構——換遊戲只要改那張對照表。
單位換像素就是 `xUnit * UNIT_PX`，`UNIT_PX` 由遊戲定義。

## 版本

見 [CHANGELOG.md](CHANGELOG.md)。遵循 SemVer 2.0.0。

## 授權

MIT
