# Changelog

本檔記錄 LevelCraft 的所有顯著變更。
格式參照 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本遵循 [SemVer 2.0.0](https://semver.org/lang/zh-TW/)。

## [0.19.1] - 2026-10-18

工單 `2026-10-12-levelcraft-editor-modularize`：純重構，使用者行為與 `levelcraft/v1` 輸出不變。

### Changed
- **`editor.js`（1.3k 行單檔）拆成原生 ES 模組 `src/`**：`main`（進入點）、`format`（格式、`VERSION` 唯一定義處，不碰 DOM）、`state`（狀態、undo、選取、群組、命中測試，不碰 DOM）、`geometry`（純幾何與縮放）、`view`（繪製）、`ui`（面板與對話框）、`interaction`（滑鼠鍵盤）、`dom`（DOM 節點）。函式本體原樣搬移；跨模組會被重新指派的 `let`（`uid`、`drag`、`pathEditingId`、`spaceDown`、`pathDashOffset`）收進 `state.js` 的 `RT` 物件。`index.html` 改載 `<script type="module" src="src/main.js">`，維持零建置。
- **`file://` 直接開不再可行**（瀏覽器擋模組），README 註明需本機靜態伺服器；GitHub Pages 不受影響。
- **`check-import.cjs` 直接 `import` `src/format.js`／`src/geometry.js`**，不再用 regex 從原始碼抽函式；新增「格式層不引用瀏覽器 API」檢查。
- `check-ui.cjs` 從 `main.js` 的測試掛鉤 `window.__levelcraft` 取狀態與函式（案例內容不變）；回滾探針改為複製 `src/` 並在對應模組突變。
- README 補檔案結構表與自檢說明。

### Verified
- 重構前後匯出逐字相同：同一支腳本在無頭 Chrome 裡把 831 份關卡（`examples/celeste-import/out`、本機 `data/levelcraft` 824 份、Unity／Phaser fixtures）經「匯入」載入後取「匯出 JSON」原文，重構前（v0.19.0）與重構後輸出檔 SHA-256 相同、831 筆逐筆相等。
## [0.19.0] - 2026-10-18

工單 `2026-10-12-levelcraft-path-relative-coords`（CEO 2026-10-12 定案：路徑改相對座標）。

### Changed
- **路徑節點改為相對元素的位移**：`elements[].path[i]` 從世界絕對座標改成元素相對其擺放位置的位移（單位，Y 向下）。編輯器把節點畫在「元素中心＋位移」，新增／拖曳節點時換算回位移；元素被拖曳、方向鍵移動、群組整組搬移、複製後路徑跟著走（原本留在原地）。
- **匯出頂層加 `"pathSpace": "relative"`**（仍是 `levelcraft/v1`，向後相容）。
- **舊檔相容**：沒有 `pathSpace` 的檔案（含舊 autosave）匯入時把每個點換成 `點 − 元素中心`，節點畫面位置與舊版相同，再匯出即為相對值。純函式 `absolutePathToOffsets`。
- **轉接器同步**：
  - Phaser：新增 `elementCenterUnit`、`resolvePathUnits(el, pathSpace)`；record 的 `path` 維持「每個節點時元素中心的世界 px」（舊消費端不變），另加 `pathOffset`（相對位移 px，`lcPathOffset`）。兩種 `pathSpace` 結果相同。
  - Unity：`LevelCraftDocument` 讀 `pathSpace`，新增 `ElementCenterUnit`／`ResolvePathPoint`／`PathOffsetToUnity`（位移只把 Y 取負號，不套世界高度翻轉）；`Element.PathUnits` 維持中心世界座標，另加 `PathOffsetUnits`；`LevelCraftElement` 新增 `PathOffset`。
- README 格式說明、兩個轉接器 README、`examples/adapter.ts` 型別同步。

### Tests
- `check-import.cjs` 新增 path legacy 案；`check-ui.cjs` 新增 3 案（舊檔匯入位置不變並以相對值匯出；拖曳／方向鍵／複製／群組搬移後節點跟著走；滑鼠新增／拖曳／右鍵刪除節點存相對位移），回滾探針新增 2 軸（共 10 條）。
- `adapters/phaser/check.cjs`、`adapters/unity/check-coords.cjs` 各補相對與舊檔同結果的案例；Unity `LevelCraftCoordTests` 新增 `Path_RelativeAndLegacy_SameWorld`。`LevelCraftDocument.cs` 另以 dotnet＋最小 UnityEngine 替身實際編譯並執行同一比對（抓到一個區域變數名衝突的編譯錯誤，已修）。
## [0.18.6] - 2026-10-18

工單 `2026-10-12-levelcraft-adaptive-zoom-min`。

### Fixed
- **大世界匯入後裝不進畫面**：`clampZoom` 寫死下限 0.15，Celeste 824 關中有 11 關（1.3%）匯入後 `fitViewToWorld` 被卡住。下限改為 `min(0.15, 裝滿畫面的 zoom × 0.9)`：80×20 這類小世界手感不變，大世界可縮到看見全貌。純函式 `fitZoomFor`／`minZoomFor` 由 `fitViewToWorld` 與滾輪共用（每次即時算，世界 W/H 或 px/單位改了自然跟著變），上限 8 不動。
  實測（無頭 Chrome，1400×900 視窗）：2000×600 → zoom 0.0201；最大的 `celeste__LostLevels__lvl_j-16`（768×340）→ 0.0523；最高的 `lvl_j-19`（40×578）→ 0.0572，三者整個世界都在畫面內。

### Tests
- `check-import.cjs` 新增 zoom floor 案（80×20 → 0.15、2000×600 的下限低於裝滿畫面的 zoom、畫面尺寸 0 不出 NaN）；`check-ui.cjs` 新增大世界匯入（含本機 Celeste 最大與最高關卡，經「選擇檔案」匯入）與 80×20 滾輪下限案；回滾探針新增「縮放下限自適應」軸（共 8 條）。
## [0.18.5] - 2026-10-18

工單 `2026-10-12-levelcraft-block-delete-type-in-use`（CEO 2026-10-12 定案：刪除使用中類型直接禁止）。

### Changed
- **使用中類型不能刪除**：原本只跳 `confirm`，確認後元素保留 type 字串但類型定義已刪 → 失去顏色與 `category`，轉接器一律退成 `object`。現在編輯類型對話框在有元素使用時不渲染「刪除類型」，改顯示「有 N 個元素正在使用此類型，不能刪除。請先刪除這些元素，或在右欄把它們改成其他類型。」；刪除處理函式本身也在 `pushUndo` 之前擋下，不留空 undo。

### Fixed
- **刪掉目前放置類型後放出孤兒元素**：刪除的類型若正是目前放置類型，之後點畫布會放出沒有定義的元素。現在自動改選同形狀、目前還能放置的類型（出生點／目的地已在場上時跳過）。

### Tests
- `check-ui.cjs` 新增 2 案（使用中禁刪且不留 undo；沒在用可刪、刪掉放置中的節點類型後仍能正常放置），`check-ui-rollback-probe.cjs` 新增 2 條軸（共 7 條）。
## [0.18.4] - 2026-10-18

工單 `2026-10-12-levelcraft-ui-regression-harness`：編輯器 UI 行為原本全靠人在瀏覽器手測，改壞了沒有紅燈；下一張 editor.js 模組化單需要這道網才能安全重構。

### Added
- **`check-ui.cjs` 瀏覽器 UI 回歸自檢**（零依賴，Node 22+ ＋本機 Chrome／Edge）：自起靜態伺服器與無頭瀏覽器，經 DevTools Protocol 送真實滑鼠／鍵盤事件，11 個案例涵蓋工具箱條件渲染（無選取／單選／多選、群組互斥、只有 movable 類型出現編輯路徑）、群組（點成員選全組、拖曳與方向鍵整組移動、解散不動位置）、類型（改名連帶、使用中禁改形狀、重名不留 undo）、連動（目標不含出生點、匯出不含懸空 links）、匯入（缺／撞 id 補號、中間檔擋下指路、成功後框住世界）、undo／redo。找不到瀏覽器時印 `SKIP` 並以退出碼 2 結束，不冒充通過。
- **`check-ui-rollback-probe.cjs`**：在暫存複本上逐一弄壞 5 處出貨行為，確認 UI 自檢在對應案例轉紅、未突變複本全綠，工作區 git status 前後不變。

### Known
- 介面目前沒有「編輯既有類型」的入口（`openTypeDlg` 只從「新增類型」以 `null` 呼叫），類型改名與禁改形狀只能經由程式呼叫對話框；UI 自檢直接呼叫 `openTypeDlg` 驗對話框邏輯，入口本身待另開單補。
## [0.18.3] - 2026-10-12

收尾性修復：引擎轉接器（v0.15–v0.18）落地後盤點編輯器結構缺口，修掉會讓匯出資料靜默出錯的幾條。

### Fixed
- **版號顯示漂移**：`editor.js` 的 `VERSION` 自 v0.17.0 起沒再跟上（實際已到 v0.18.2）。
  `check-import.cjs` 新增 version sync 檢查：`VERSION` 必須等於本檔最新條目，否則 FAIL。
- **類型改名留下孤兒元素**：改名後既有元素仍指向舊名 → 失去顏色與 `category`，轉接器一律退成 `object`。
  改名現在連帶更新所有使用中元素與目前選用類型。
- **使用中類型改形狀**：rect／point 的資料欄位不同（`wUnit/hUnit` 有無），改了會讓 `kind` 與 `shape` 不一致。
  有元素在用時改為擋下並提示。
- **類型儲存失敗留空 undo**：名稱重複的驗證排在 `pushUndo` 之後，失敗也會吃掉一次 Ctrl+Z。驗證改到前面。
- **匯出懸空 `links`**：可以連到 spawn（匯出時收進頂層 `spawnUnit`，不在 `elements`），或連到已不存在的 id，
  轉接器解析 `targetId` 會落空。連動目標排除 spawn；匯出只保留指向實際匯出元素的 links。
- **匯入缺 id／撞 id**：手寫或外部工具產的 JSON 缺 `id` 或重複時，選取、群組、links 會互相錯接。
  新增純函式 `normalizeElementRefs`：補號、去重、清掉懸空／自連／重複 links（附自檢）。
- **匯入壞 `snap`** 收斂為非負有限數（原本字串或負值會原樣進狀態）。
- **方向鍵只移主選取**：多選與群組拖曳是整組動，方向鍵卻只動第一個。改為整組微調，與拖曳一致。
- **「新關卡」殘留群組與路徑編輯狀態**，且視圖沒框回新世界。一併重設。

## [0.18.2] - 2026-08-09

### Changed
- 清除 `index.html` 內 2 處手寫固定 px 小數，對齊 2026-08-07 CEO 裁定的跨專案 UI 規範
  （共用 skill `design-antipatterns` 正向鐵則 #13 ／ 偵測規則 `fractional-px`）：
  `header .title` 字距 `.3px` → `0.023em`（基準 body 13px）、
  `.sec h3` 字距 `.8px` → `0.073em`（基準同區塊 font-size 11px）。
  字距改用 `em` 而非進位成 `1px`——`em` 把次像素交給瀏覽器計算，是規範明文允許的作法，
  且維持原本的視覺鬆緊；進位成 `1px` 會把字距放大 2～3 倍。
  驗證：`node ~/dotfiles/tools/scan-fractional-px.mjs --only LevelCraft` → `0 處`。

## [0.18.1] - 2026-08-05

### Fixed
- Unity Editor asmdef now explicitly references the official `Unity.2D.Tilemap.Editor`
  assembly required by `GridPaletteUtility`, fixing CS0234 in clean projects.
- Added a headless Palette persistence smoke that creates the native Palette, paints a
  Tilemap cell, saves/reopens the scene, and verifies the persisted Tile asset reference.
- Documented that blank Unity projects must install the official 2D Tilemap Editor package.

## [0.18.0] - 2026-08-04

### Fixed
- Unity adapter now persists generated Tile assets and creates a native Unity Grid
  Palette prefab, so imported Solids/Hazards/Decor remain paintable after scene reload.
- Documented the complete Tile Palette edit workflow and re-import boundary.

## [0.17.2] - 2026-07-25

### Fixed
- Unity importer 誤選 intermediate / `_index.json` 時不再只丟 `Missing world`：先辨識管線中間檔並給可據以行動的錯誤訊息（對齊 web 編輯器 `validateLevel`）。
- 接受 UTF-8 BOM 前綴；`world.w`/`h` 與 `elements`/`els` 別名（editor autosave 相容）。
- Unity 6 棄用 API：`TilemapCollider2D.usedByComposite` → `compositeOperation`；ScriptedImporter 子資產 id 不再用 `GetInstanceID()`。

### Added
- EditMode：`Parse_AgreedStructure_DemoLevel`、`Parse_Rejects_Intermediate*`、`Parse_BOM_*`。
- `adapters/unity/Fixtures/`（`level-demo.json`、celeste sample、intermediate 負例）。
- Headless 煙霧：`LevelCraftMenu.BatchImportSmoke`（`-executeMethod`）。

### Docs
- README 註明可匯入／不可匯入的 JSON 種類。

## [0.17.1] - 2026-07-25

### Fixed
- Unity EditMode 測試從 `Tests/`（runtime 組件）移到 `Tests/Editor/`，並加上 Runtime／Editor／Tests `asmdef` 明確引用，修正 `LevelCraft.Unity.Editor` CS0234（runtime 看不到 Editor 命名空間）。

### Docs
- `adapters/unity/README.md` 標明測試必須在 `Tests/Editor/`。

## [0.17.0] - 2026-07-18

### Added
- **官方 Unity 2D Tilemap 轉接器** [`adapters/unity/`](adapters/unity/)：Editor 選單匯入 `levelcraft/v1` → `Grid`/`Tilemap`/`TilemapCollider2D`+`CompositeCollider2D`（solid／hazard／decor 分層）；object／point 掛 `LevelCraftElement`（props／links 解析／path Y-up）；手寫極簡 JSON parser（不依第三方）。
- 座標公式 Node 自檢 `adapters/unity/check-coords.cjs`；Unity EditMode 測試 `Tests/Editor/LevelCraftCoordTests.cs`。
- 可選 `*.levelcraft` ScriptedImporter；主路徑為選單匯入（免改副檔名）。

### Docs
- `adapters/unity/README.md`：安裝、Tile Palette 續編、Y 軸換算、與 Phaser 對照。
- 主 README 官方轉接器表加入 Unity 列。

## [0.16.0] - 2026-07-18

### Added
- **官方 Phaser 3 轉接器** [`adapters/phaser/`](adapters/phaser/)：零依賴單檔 ES module `loadLevelCraft(scene, json, { unitPx })`，依 `types[].category` 分流成 Arcade StaticGroup（solid）／Zone groups（hazard／object）／純資料（decor）；提供 `byId`、`resolveLinks`、path 單位→px。
- 純資料層可 Node 自檢：`node adapters/phaser/check.cjs`（不依賴 Phaser）。
- 最小可跑 demo：`adapters/phaser/example/`（Phaser CDN + 範例關卡 JSON）。

### Docs
- `adapters/phaser/README.md`：API、座標、category 對應、links/path。
- 主 README「遊戲端怎麼吃」加官方轉接器一節。

## [0.15.0] - 2026-07-18

### Added
- **類型 `category` 語意欄位**（`solid`／`hazard`／`object`／`decor`）：在「編輯類型」對話框可選，隨 `levelcraft/v1` 的 `types[]` 匯出。內建類型帶預設（ground/oneway/wall/ladder→solid，spike→hazard，其餘 object）。`shape` 仍是幾何，與 category 獨立。
- 新增自訂類型時 category 必選（UI 下拉，預設 `object`）。

### Changed
- 舊 JSON 缺 `category` 時匯入預設 `object`（向後相容、不報錯）。
- `examples/adapter.ts` 優先讀 `types[].category`，找不到才 fallback 本機對照表；`decor` 不進 solids/hazards/objects。
- README `levelcraft/v1` 格式文件同步 category 說明。

### Docs
- `check-import.cjs` 補 category 正規化／缺欄預設 object 自檢。

## [0.14.1] - 2026-07-17

### Fixed
- 誤選抽取管線的**中間檔**（`data/intermediate/`）匯入時，錯誤訊息從只說「缺少 world 與 elements」改為指出這是中間檔（含來源房間名）並指路到 `data/levelcraft/` 的 `celeste__*.json` 或轉檔指令。中間檔與轉換後關卡同名、只差 `celeste__` 前綴又住在相鄰資料夾，選錯是常態；原訊息技術上正確但無法據以行動。`_index.json` 房間清單檔同樣會被認出（它排序在資料夾第一個，最容易誤選）。
- 匯入失敗不再留下一筆什麼都還原不了的 undo：先前 `pushUndo()` 排在驗證之前，壞輸入被擋下後 undo 堆疊仍多一筆，害失敗後第一次 Ctrl+Z 沒有反應（0.14.0 引入）。

### Added
- `check-import.cjs`：零依賴自檢（`node check-import.cjs`），拿 `editor.js` 出貨中的分類函式跑 `examples/` 底下的真檔，確保中間檔一定被認出、真關卡一定不被誤擋。

## [0.14.0] - 2026-07-17

### Added
- 匯入對話框可直接「選擇檔案」開 `.json`，不必先用記事本開檔複製貼上；貼上路徑保留為進階／除錯用，兩者共用同一條載入管線。
- 匯入成功會在狀態列顯示「已匯入 {關卡名}（N 個元素）」。

### Fixed
- 匯入後視圖會框住整個關卡並置中。先前沿用匯入前的視角，只要使用者平移或縮放過，關卡就落在畫面外，看起來像「按了沒反應」（本次問題根因）。
- 匯入失敗一律顯示可見錯誤：空內容、非法 JSON、非物件、缺 `world`／`elements`、`format` 不符都會跳訊息且不關閉對話框。先前非物件的 JSON（例如陣列）會被靜默當成空關卡載入。

### Changed
- 標題列版號改由 `editor.js` 的 `VERSION` 單一來源填入，修正先前顯示停在 `v0.11.1` 的漂移。

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
