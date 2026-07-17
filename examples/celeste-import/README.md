# Celeste → LevelCraft 實驗匯入管線

把**本機正版** Celeste `Content/Maps/*.bin` 轉成 `levelcraft/v1` 的腳本與映射。  
**不包含、也不提交官方 map 本體。**

研究 SSOT（SBM）：`30_Resources/研究/Celeste關卡地圖資料—LevelCraft實驗資料源.md`  
合規：`software-re` skill（不散佈官方資產、不繞 DRM）。

## 目錄

| 路徑 | 說明 |
|------|------|
| `bin_to_intermediate.py` | 本機 `Content/Maps/*.bin` → intermediate room JSON（BinaryPacker；零第三方套件） |
| `intermediate_to_levelcraft.cjs` | intermediate JSON → `levelcraft/v1`（零依賴 Node） |
| `fixtures/synthetic-*.json` | **手製**合成 intermediate（非官方），用來驗管線 |
| `out/` | 合成轉檔示範輸出（可 commit） |
| `data/intermediate/` | 本機抽取的中間檔（**必 gitignore**）。管線中繼格式，**不能**直接匯入編輯器 |
| `data/levelcraft/` | 轉換後的 `levelcraft/v1` 關卡（**必 gitignore**）。**要匯入編輯器的是這裡的 `celeste__*.json`** |

## 前置

1. 本機安裝正版 Celeste。
2. **預設路徑（本機已驗證）**：`S:\Steam\steamapps\common\Celeste`
3. Python 3 + Node（僅標準庫／內建模組）。
4. 也可改用既有工具把 `.bin` 轉成 intermediate 後對齊 schema：
   - [Celestial](https://github.com/maddievision/Celestial) `map2json.rb`
   - [Maple](https://github.com/CelestialCartographers/Maple)（Julia）
   - Rust crate [`celeste`](https://docs.rs/celeste)

環境變數（可選）：

```text
CELESTE_ROOT=S:\Steam\steamapps\common\Celeste   # 或你的安裝根
CELESTE_MAPS=%CELESTE_ROOT%\Content\Maps
```

## Intermediate schema（本管線輸入）

每個 **room** 一個 JSON（或 batch 陣列，見 CLI）：

```jsonc
{
  "sourceMap": "1-ForsakenCity",   // 章節檔 basename
  "sourceRoom": "a-00",            // room name
  "side": "A",                     // 可選
  "widthTiles": 40,                // room 寬（tile）；缺則由 solids 推
  "heightTiles": 23,
  "solids": [                      // 列優先：每列一字串，長=寬；'0'/空白=空氣，其他=實心
    "0000000000",
    "XXXXXXXXXX"
  ],
  "entities": [
    { "name": "player", "x": 16, "y": 120, "width": 8, "height": 11 },
    { "name": "spikesUp", "x": 80, "y": 176, "width": 16, "height": 8 }
  ]
}
```

- 座標：**像素**（Celeste 慣例）；轉檔時 `/ 8` → LevelCraft unit（1 unit = 1 tile）。
- `solids` 也可用二維 `number[][]`（0=空，非 0=實心）。

## 使用

```bash
# 0) 合成 fixture 驗管線（不需遊戲）
node examples/celeste-import/intermediate_to_levelcraft.cjs \
  --in examples/celeste-import/fixtures \
  --out examples/celeste-import/out

# 1a) 抽樣（快速驗管線）
python examples/celeste-import/bin_to_intermediate.py \
  --maps "S:/Steam/steamapps/common/Celeste/Content/Maps" \
  --out examples/celeste-import/data/intermediate \
  --maps-filter 0-Intro,1-ForsakenCity \
  --rooms-per-map 12

# 1b) 全量（27 個 .bin、每 map 全部 room；--rooms-per-map 0 = 不截斷）
python examples/celeste-import/bin_to_intermediate.py \
  --maps "S:/Steam/steamapps/common/Celeste/Content/Maps" \
  --out examples/celeste-import/data/intermediate \
  --rooms-per-map 0

# 2) intermediate → levelcraft/v1（gitignore）
node examples/celeste-import/intermediate_to_levelcraft.cjs \
  --in examples/celeste-import/data/intermediate \
  --out examples/celeste-import/data/levelcraft
```

然後用 LevelCraft 開 `index.html` → 選檔匯入 `data/levelcraft/*.json`（或合成 `out/*.json`）。

**本機全量結果（2026-07-17）**：27 maps → **824** intermediate / levelcraft room（僅 `data/`，gitignore）。

**建議人工驗收 3 room（真實抽取）**：

- `data/levelcraft/celeste__0-Intro__lvl_0.json`
- `data/levelcraft/celeste__1-ForsakenCity__lvl_1.json`
- `data/levelcraft/celeste__1-ForsakenCity__lvl_2.json`

## 合規禁推

- ❌ `Content/Maps/*.bin`、完整官方 map JSON、可還原整章官方布局的 bulk dump  
- ✅ 本目錄腳本、映射表、合成 fixture、文件  

## 本機 Maps 清單

填在 SBM 研究筆記**附錄 A**。本機值機掃描結果見該附錄（無安裝時會註明搜尋路徑）。
