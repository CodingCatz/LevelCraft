# Changelog

本檔記錄 LevelCraft 的所有顯著變更。
格式參照 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本遵循 [SemVer 2.0.0](https://semver.org/lang/zh-TW/)。

## [0.13.0] - 2026-07-17

### Added
- `examples/celeste-import/bin_to_intermediate.py`：本機正版 `Content/Maps/*.bin` BinaryPacker 解析 → intermediate room JSON（對齊 Celestial `celeste_map.rb` 讀取路徑；輸出僅寫入 gitignored `data/`）。

### Fixed
- `intermediate_to_levelcraft.cjs`：略過 `_*.json` 索引與無 solids 的 payload，避免 `_index.json` 覆寫有效輸出為空 elements。

### Changed
- `examples/celeste-import/README.md`：文件化 `CELESTE_ROOT` + 兩段 CLI（bin→intermediate→levelcraft/v1）。

## [0.12.0] - 2026-07-17

### Added
- `examples/celeste-import/`：Celeste intermediate → `levelcraft/v1` 轉接管線（`intermediate_to_levelcraft.cjs`、合成 fixture ×3、合規 README）。供本機正版 Maps 抽取後匯入實驗；**不含**官方 map 本體。

## [0.11.1] - 2026-07-13

### Fixed
- 修正路徑編輯在取消對象選取時，編輯工具被誤設為已廢棄的 `'select'` 工具的回歸 bug，改為重設為矩形或標記工具。
- 修正 `README.md` 中重複的匯出操作說明。

## [0.11.0] - 2026-07-12

### Added
- 類型可標記為 `movable`；僅可移動類型的已選取元素才會出現「編輯路徑」，並將設定與資料一起匯出／匯入。
- 工具箱新增選取元素專用的連動面板，以及並排的刪除／複製操作。

### Changed
- 工具箱操作改為條件式渲染：不可執行的按鈕不再留在 DOM；建立／解散群組互斥顯示。
- 編輯類型對話框將「形狀」正名為「類型」，改用含矩形／點圖示的自訂選單。
- 屬性面板的類型選單只列同大類既有類型，移除任意自訂類型入口；連動、刪除與複製入口統一移至工具箱。

## [0.10.1] - 2026-07-12

### Fixed
- 框選變更選取集合時同步刷新工具箱，建立／解散群組按鈕會立即反映可操作狀態。

## [0.10.0] - 2026-07-12

### Changed
- 「新增類型」移至世界設定區塊；工具箱改為直式操作列，集中路徑編輯與建立／解散群組。
- 未選取元素時停用路徑與群組操作並隱藏路徑提示；選取元素後依路徑節點數提供對應說明。
- 移除群組恆常外框；選取群組成員時，群組全部成員的邊框會以青色統一高亮。

## [0.9.1] - 2026-07-12

### Changed
- 屬性面板明示 links/targetId 是供遊戲邏輯讀取的資料參照，不會帶動選取或搬移；以細橘色虛線與單向箭頭區隔群組的青色實線外框。

## [0.9.0] - 2026-07-12

### Added
- 可把兩個以上未群組元素建立為編輯器群組；群組以青色實線外框呈現，點擊任何成員會選取整組，拖曳、複製與刪除皆會以整組處理，並可從屬性面板解散。
- 群組關係會隨 undo/redo 與 localStorage autosave 保留；為維持 `levelcraft/v1` 遊戲端格式，正式匯出 JSON 不含群組資料。

## [0.8.1] - 2026-07-12

### Fixed
- 畫布容器與側欄改為可安全縮放的 grid 子項目，並以 `ResizeObserver` 追蹤容器重排；視窗縮放、版面 reflow 後會在下一個畫面幀重新計算 canvas，避免畫布尺寸與可視區脫鉤而壓縮或遺失底部工具列。

## [0.8.0] - 2026-07-12

### Changed
- 左側工具箱改為世界設定下方的常駐標題區塊，直接提供新增類型與路徑編輯操作；不再使用工具箱彈出視窗。
- 路徑資訊會隨目前選取元素即時更新。

## [0.7.0] - 2026-07-12

### Added
- 左側工具箱彈出蓋板，可管理自訂類型與任一元素的路徑節點。
- 路徑節點支援新增、拖曳、右鍵刪除、autosave、undo/redo 與 JSON 匯出入；選取路徑以流動虛線呈現。

## [0.6.0] - 2026-07-12

### Added
- 類型與單一元素皆可填寫描述；有內容時會匯出至 `levelcraft/v1` JSON，供人類與 AI 理解關卡語意。

### Changed
- 世界設定與類型形狀的補充說明改為滑過標題／標籤時顯示，減少常駐介面雜訊。

## [0.5.0] - 2026-07-12

### Added
- 出生點與目的地各限制一個；工具列會鎖住已存在的節點，刪除後自動解鎖。
- 舊版只有 `spawnUnit` 的存檔匯入時，會還原成可選取、拖曳與刪除的出生點元素。

### Changed
- 工具列、狀態指示、類型清單與介面控制全面改為統一風格的 inline SVG 圖示，不再以 Unicode 符號充當圖示。
- 出生點改由一般元素模型管理；匯出仍保留 v1 頂層 `spawnUnit`，不影響既有轉接器。

## [0.4.1] - 2026-07-12

### Fixed
- 底部工具列及上拉選單的滑鼠事件不再穿透到畫布，切換工具不會同時放置或選取元素。
- 多選刪除會完整移除選取集合及其關聯 links；右鍵對多選集合操作會先以一致介面的對話框確認。
- 多選後拖曳其中任一選取元素，整組會維持相對位置一起移動。

## [0.4.0] - 2026-07-12

### Changed
- 移除獨立選取模式：左鍵命中既有元素時一律選取並可拖曳；空白處單擊放置目前類型，拖曳超過門檻則框選。
- 工具列首位改為動態狀態指示，依目前放置類型、框選、平移與縮放即時切換圖示。
- 矩形改為單擊建立預設大小，後續以四角把手調整，避免與空白拖曳框選衝突。

### Fixed
- 框選放開後立即重繪，不再殘留虛線框。
- 框選框改為細的近白色虛線。

## [0.3.0] - 2026-07-12

### Added
- 畫布底部置中的五項圖示工具列：選取、方框、標記、節點與新增自訂類型。
- 選取工具支援在畫布空白處拖曳框選；被完整框住的矩形與落在範圍內的點標記會一併標示選取。
- 方框／標記／節點工具可向上展開類型清單，並顯示目前啟用類型；自訂類型會按形狀自動納入方框或節點清單。

### Changed
- 移除左側的舊工具與類型調色盤；左欄現在只保留世界設定。
- 世界寬、高、吸附與 px/單位改為各自獨立一列，數值輸入空間更寬。

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
[0.3.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.3.0
[0.4.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.4.0
[0.4.1]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.4.1
[0.5.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.5.0
[0.6.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.6.0
[0.7.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.7.0
[0.8.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.8.0
[0.8.1]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.8.1
[0.9.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.9.0
[0.9.1]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.9.1
[0.10.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.10.0
[0.10.1]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.10.1
[0.11.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.11.0
[0.11.1]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.11.1
[0.12.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.12.0
[0.13.0]: https://github.com/CodingCatz/LevelCraft/releases/tag/v0.13.0
