using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.Tilemaps;
using LevelCraft.Unity;

namespace LevelCraft.Unity.Editor
{
    /// <summary>
    /// Editor entry points for importing LevelCraft JSON into the open scene.
    /// </summary>
    /// <remarks>
    /// Uses a menu command rather than ScriptedImporter as the default path because
    /// LevelCraft exports plain <c>.json</c>; forcing a custom extension is friction.
    /// Power users can still rename to <c>.levelcraft.json</c> — see optional importer.
    /// </remarks>
    public static class LevelCraftMenu
    {
        #region 常數

        const string MenuPath = "Assets/LevelCraft/Import Level JSON…";
        const string MenuPathScene = "GameObject/LevelCraft/Import Level JSON…";
        const string SmokeOutputFolder = "Assets/LevelCraftSmokeOutput";
        const string SmokePaletteName = "LevelCraftPaletteSmoke";
        const string SmokeScenePath = SmokeOutputFolder + "/LevelCraftPaletteSmoke.unity";

        #endregion 常數

        #region 批次驗證

        /// <summary>
        /// Headless smoke: parse + build agreed-structure fixture.
        /// Unity: <c>-executeMethod LevelCraft.Unity.Editor.LevelCraftMenu.BatchImportSmoke</c>
        /// Exit 0 on success, 1 on failure. Looks for Fixtures under Assets/.../LevelCraft.
        /// </summary>
        public static void BatchImportSmoke()
        {
            RunBatchImportSmoke(createPalette: false);
        }

        /// <summary>
        /// Headless persistence smoke: build a native Grid Palette, paint a Tilemap cell,
        /// save/reopen the scene, and verify the persisted Tile reference.
        /// Unity: <c>-executeMethod LevelCraft.Unity.Editor.LevelCraftMenu.BatchImportPaletteSmoke</c>.
        /// Writes disposable evidence under <c>Assets/LevelCraftSmokeOutput</c>.
        /// </summary>
        public static void BatchImportPaletteSmoke()
        {
            RunBatchImportSmoke(createPalette: true);
        }

        static void RunBatchImportSmoke(bool createPalette)
        {
            try
            {
                var fixture = FindFixturePath();
                if (fixture == null)
                {
                    Debug.LogError("[LevelCraft] BatchImportSmoke: fixture level-demo.json not found under Assets.");
                    EditorApplication.Exit(1);
                    return;
                }

                Debug.Log("[LevelCraft] BatchImportSmoke fixture=" + fixture);
                var text = File.ReadAllText(fixture);
                var doc = LevelCraftDocument.Parse(text);
                if (doc.WorldWUnit <= 0f || doc.WorldHUnit <= 0f || doc.Elements.Count == 0)
                {
                    Debug.LogError("[LevelCraft] BatchImportSmoke: parsed doc empty/invalid");
                    EditorApplication.Exit(1);
                    return;
                }

                if (createPalette)
                {
                    // CI-only path: start clean so stale assets cannot make the smoke pass.
                    EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    if (AssetDatabase.IsValidFolder(SmokeOutputFolder) &&
                        !AssetDatabase.DeleteAsset(SmokeOutputFolder))
                    {
                        throw new System.InvalidOperationException(
                            "Failed to reset disposable smoke folder: " + SmokeOutputFolder);
                    }
                    AssetDatabase.CreateFolder("Assets", "LevelCraftSmokeOutput");
                }

                var root = LevelCraftLevelBuilder.Build(doc, new LevelCraftLevelBuilder.Options
                {
                    Scale = 1f,
                    // The basic smoke remains non-mutating. The explicit palette smoke
                    // writes to a dedicated disposable folder and exercises the real path.
                    TileAssetFolder = createPalette ? SmokeOutputFolder : null,
                    TilePaletteFolder = SmokeOutputFolder,
                    TilePaletteName = SmokePaletteName,
                    CreateTilePalette = createPalette,
                });
                if (root == null)
                {
                    Debug.LogError("[LevelCraft] BatchImportSmoke: Build returned null");
                    EditorApplication.Exit(1);
                    return;
                }

                var grid = root.GetComponentInChildren<UnityEngine.Grid>();
                var maps = root.GetComponentsInChildren<UnityEngine.Tilemaps.Tilemap>();
                var elements = root.GetComponentsInChildren<LevelCraftElement>();
                var hasGrid = grid != null;
                var mapCount = maps.Length;
                var elementCount = elements.Length;
                if (!hasGrid || mapCount != 3 || elementCount == 0)
                    throw new System.InvalidOperationException(
                        $"Unexpected hierarchy: grid={hasGrid} tilemaps={mapCount} " +
                        $"LevelCraftElement={elementCount}");

                var paletteEvidence = "palette=skipped";
                if (createPalette)
                    paletteEvidence = ValidatePalettePersistence(root);

                Debug.Log(
                    $"[LevelCraft] BatchImportSmoke OK name={doc.Name} world={doc.WorldWUnit}x{doc.WorldHUnit} " +
                    $"elements={doc.Elements.Count} grid={hasGrid} tilemaps={mapCount} " +
                    $"LevelCraftElement={elementCount} {paletteEvidence}");
                if (!createPalette)
                    UnityEngine.Object.DestroyImmediate(root);
                EditorApplication.Exit(0);
            }
            catch (System.Exception ex)
            {
                Debug.LogError("[LevelCraft] BatchImportSmoke FAILED: " + ex);
                EditorApplication.Exit(1);
            }
        }

        static string ValidatePalettePersistence(GameObject root)
        {
            var palettePath = SmokeOutputFolder + "/" + SmokePaletteName + ".prefab";
            var paletteAsset = AssetDatabase.LoadAssetAtPath<GameObject>(palettePath);
            if (paletteAsset == null)
                throw new System.InvalidOperationException("Palette prefab was not created: " + palettePath);

            TileBase paletteTile = null;
            var paletteRoot = PrefabUtility.LoadPrefabContents(palettePath);
            try
            {
                var paletteMap = paletteRoot.GetComponentInChildren<UnityEngine.Tilemaps.Tilemap>();
                if (paletteMap == null)
                    throw new System.InvalidOperationException("Palette prefab has no Tilemap: " + palettePath);
                foreach (var cell in paletteMap.cellBounds.allPositionsWithin)
                {
                    paletteTile = paletteMap.GetTile(cell);
                    if (paletteTile != null) break;
                }
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(paletteRoot);
            }

            if (paletteTile == null || !AssetDatabase.Contains(paletteTile))
                throw new System.InvalidOperationException("Palette has no persisted Tile asset.");

            var tilePath = AssetDatabase.GetAssetPath(paletteTile);
            var solids = root.transform.Find("Grid/Solids")?.GetComponent<UnityEngine.Tilemaps.Tilemap>();
            if (solids == null)
                throw new System.InvalidOperationException("Imported hierarchy has no Grid/Solids Tilemap.");

            var paintCell = new Vector3Int(101, 101, 0);
            solids.SetTile(paintCell, paletteTile);
            var rootName = root.name;
            if (!EditorSceneManager.SaveScene(SceneManager.GetActiveScene(), SmokeScenePath))
                throw new System.InvalidOperationException("Failed to save smoke scene: " + SmokeScenePath);

            var reopened = EditorSceneManager.OpenScene(SmokeScenePath, OpenSceneMode.Single);
            GameObject reloadedRoot = null;
            foreach (var sceneRoot in reopened.GetRootGameObjects())
            {
                if (sceneRoot.name != rootName) continue;
                reloadedRoot = sceneRoot;
                break;
            }

            var reloadedSolids = reloadedRoot?.transform
                .Find("Grid/Solids")?.GetComponent<UnityEngine.Tilemaps.Tilemap>();
            var reloadedTile = reloadedSolids?.GetTile(paintCell);
            if (reloadedTile == null || AssetDatabase.GetAssetPath(reloadedTile) != tilePath)
                throw new System.InvalidOperationException(
                    "Painted Tile reference did not survive scene reload. Expected " + tilePath);

            return $"palette={palettePath} persistedTile={tilePath} scene={SmokeScenePath}";
        }

        static string FindFixturePath()
        {
            // Prefer packaged fixture next to the adapter copy in the Unity project.
            var candidates = new[]
            {
                Path.Combine(Application.dataPath, "LevelCraft", "Fixtures", "level-demo.json"),
                Path.Combine(Application.dataPath, "unity", "Fixtures", "level-demo.json"),
                Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "LevelCraft", "adapters", "unity", "Fixtures", "level-demo.json")),
                Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "LevelCraft", "adapters", "phaser", "example", "level-demo.json")),
            };
            foreach (var c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
            }
            // Last resort: any level-demo.json under Assets
            foreach (var f in Directory.GetFiles(Application.dataPath, "level-demo.json", SearchOption.AllDirectories))
                return f;
            return null;
        }

        #endregion 批次驗證

        #region 匯入選單

        /// <summary>Import from disk into the active scene.</summary>
        [MenuItem(MenuPath, false, 2000)]
        [MenuItem(MenuPathScene, false, 10)]
        public static void ImportLevelJson()
        {
            var path = EditorUtility.OpenFilePanel("Import LevelCraft Level", Application.dataPath, "json");
            if (string.IsNullOrEmpty(path)) return;
            ImportFromPath(path);
        }

        /// <summary>Import selected project JSON asset(s).</summary>
        [MenuItem("Assets/LevelCraft/Import Selected JSON as Level", false, 2001)]
        public static void ImportSelected()
        {
            foreach (var obj in Selection.objects)
            {
                var assetPath = AssetDatabase.GetAssetPath(obj);
                if (string.IsNullOrEmpty(assetPath) || !assetPath.EndsWith(".json")) continue;
                var full = Path.GetFullPath(assetPath);
                ImportFromPath(full, suggestTileFolder: true);
            }
        }

        [MenuItem("Assets/LevelCraft/Import Selected JSON as Level", true)]
        static bool ImportSelectedValidate()
        {
            foreach (var obj in Selection.objects)
            {
                var assetPath = AssetDatabase.GetAssetPath(obj);
                if (!string.IsNullOrEmpty(assetPath) && assetPath.EndsWith(".json")) return true;
            }
            return false;
        }

        /// <summary>Core import from a filesystem path.</summary>
        public static GameObject ImportFromPath(string path, bool suggestTileFolder = false)
        {
            string text;
            try
            {
                text = File.ReadAllText(path);
            }
            catch (System.Exception ex)
            {
                EditorUtility.DisplayDialog("LevelCraft Import", "Failed to read file:\n" + ex.Message, "OK");
                return null;
            }

            LevelCraftDocument doc;
            try
            {
                doc = LevelCraftDocument.Parse(text);
            }
            catch (System.Exception ex)
            {
                EditorUtility.DisplayDialog("LevelCraft Import", "Parse failed:\n" + ex.Message, "OK");
                return null;
            }

            var scale = 1f;
            // Optional scale prompt kept simple: use 1. Change via LevelCraftLevelRoot.Scale after if needed.
            var options = new LevelCraftLevelBuilder.Options
            {
                Scale = scale,
                // Tiles must be assets, not transient ScriptableObjects: scene reload and
                // Tile Palette painting both require stable TileBase references.
                TileAssetFolder = "Assets/LevelCraftTiles",
                TilePaletteFolder = "Assets/LevelCraftTiles",
                TilePaletteName = "LevelCraftPalette",
                CreateTilePalette = true,
            };

            var root = LevelCraftLevelBuilder.Build(doc, options);
            Undo.RegisterCreatedObjectUndo(root, "Import LevelCraft Level");
            Selection.activeGameObject = root;
            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());

            Debug.Log(
                $"[LevelCraft] Imported \"{doc.Name}\" from {path} " +
                $"(world {doc.WorldWUnit}×{doc.WorldHUnit}u, {doc.Elements.Count} elements, scale={scale}). " +
                "Solids/Hazards/Decor are official Tilemaps under Grid — edit further with Tile Palette.");

            return root;
        }

        #endregion 匯入選單
    }
}
