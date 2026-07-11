# Changelog

本檔記錄 LevelCraft 的所有顯著變更。
格式參照 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本遵循 [SemVer 2.0.0](https://semver.org/lang/zh-TW/)。

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
