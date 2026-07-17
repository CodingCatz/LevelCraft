# Celeste → LevelCraft 實驗匯入管線

把**本機正版** Celeste `Content/Maps/*.bin` 轉成 `levelcraft/v1` 的腳本與映射。  
**不包含、也不提交官方 map 本體。**

研究 SSOT（SBM）：`30_Resources/研究/Celeste關卡地圖資料—LevelCraft實驗資料源.md`  
合規：`software-re` skill（不散佈官方資產、不繞 DRM）。

## 目錄

| 路徑 | 說明 |
|------|------|
| `intermediate_to_levelcraft.cjs` | intermediate JSON → `levelcraft/v1`（零依賴 Node） |
| `fixtures/synthetic-*.json` | **手製**合成 intermediate（非官方），用來驗管線 |
| `out/` | 轉檔輸出（預設 gitignore；合成示範可選 commit） |
| `data/` | 放本機抽取的 intermediate／官方衍生（**必 gitignore**） |

## 前置

1. 本機安裝正版 Celeste。
2. 用既有工具把 `.bin` 轉成 intermediate（**擇一**，不重寫 BinaryPacker）：
   - [Celestial](https://github.com/maddievision/Celestial) `map2json.rb`
   - [Maple](https://github.com/CelestialCartographers/Maple)（Julia）
   - Rust crate [`celeste`](https://docs.rs/celeste)
3. 若匯出 JSON 欄位名與本 intermediate schema 不同，先用薄適配層對齊（見下方 schema）。

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
# 合成 fixture 驗管線（不需遊戲）
node examples/celeste-import/intermediate_to_levelcraft.cjs \
  --in examples/celeste-import/fixtures \
  --out examples/celeste-import/out

# 本機 intermediate（gitignore 目錄）
node examples/celeste-import/intermediate_to_levelcraft.cjs \
  --in examples/celeste-import/data/intermediate \
  --out examples/celeste-import/data/levelcraft
```

然後用 LevelCraft 開 `index.html` → 匯入 `out/*.json`。

## 合規禁推

- ❌ `Content/Maps/*.bin`、完整官方 map JSON、可還原整章官方布局的 bulk dump  
- ✅ 本目錄腳本、映射表、合成 fixture、文件  

## 本機 Maps 清單

填在 SBM 研究筆記**附錄 A**。本機值機掃描結果見該附錄（無安裝時會註明搜尋路徑）。
