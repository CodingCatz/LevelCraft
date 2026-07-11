# Changelog

本檔記錄 LevelCraft 的所有顯著變更。
格式參照 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本遵循 [SemVer 2.0.0](https://semver.org/lang/zh-TW/)。

## [0.2.1] - 2026-07-12

### Fixed
- 縮放把手的命中判斷改為優先於目前工具；剛使用矩形、標記或出生點工具後仍能正確拖曳已選矩形的角點縮放。
- 以一致的自訂 ▲／▼ 微調控制取代瀏覽器原生 number spinner，世界設定與元素座標值不再被控制圖示遮擋。

### Changed
- 微調控制固定貼齊數值欄位右側，保留完整數字可讀與可輸入區域。

## [0.2.0] - 2026-07-12

### Added
- 畫布元素可右鍵直接刪除，沿用既有復原與自動存檔流程。
- 選取矩形的縮放把手加大並有明確外框，畫布游標會回饋移動與縮放可操作位置。

### Changed
- 加寬世界設定與元素座標的數值欄位，為原生 number spinner 預留空間。
- 統一左右側欄的 scrollbar 視覺；移除元素清單的內層捲動，避免巢狀捲動。

## [0.1.0] - 2026-07-11

首個公開版本。

### Added
- 單位座標制 2D 關卡編輯器，純前端、零依賴、單一 HTML + JS，可直接架 GitHub Pages。
- 兩種元素：**矩形**（帶 `wUnit/hUnit`）與**點標記**（僅座標）。
- **類型調色盤**：類型 = 名稱 + 顏色 + 形狀，可自由增刪；語意留給遊戲解讀（內建 11 個平台遊戲常用預設）。
- 每個元素可掛**自訂屬性 `props`** 與**連動 `links`**（開關→門的 targetId 關係，畫布上以箭頭呈現）。
- 畫布操作：單位格線 + 可調吸附、以游標為中心的滾輪縮放、中鍵／空白鍵平移。
- 編輯操作：拖曳畫／移／縮、精確數值輸入、方向鍵微調、複製、刪除、復原／重做。
- 匯入／匯出 `levelcraft/v1` JSON、下載 `.json`、localStorage 自動存檔。
- 遊戲端消費範例 `examples/adapter.ts`（一張 CATEGORY 對照表換遊戲）。

[0.1.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.1.0
[0.2.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.2.0
[0.2.1]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.2.1
