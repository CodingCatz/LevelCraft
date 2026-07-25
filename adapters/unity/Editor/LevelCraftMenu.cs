using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
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
        const string MenuPath = "Assets/LevelCraft/Import Level JSON…";
        const string MenuPathScene = "GameObject/LevelCraft/Import Level JSON…";

        /// <summary>
        /// Headless smoke: parse + build agreed-structure fixture.
        /// Unity: <c>-executeMethod LevelCraft.Unity.Editor.LevelCraftMenu.BatchImportSmoke</c>
        /// Exit 0 on success, 1 on failure. Looks for Fixtures under Assets/.../LevelCraft.
        /// </summary>
        public static void BatchImportSmoke()
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

                var root = LevelCraftLevelBuilder.Build(doc, new LevelCraftLevelBuilder.Options { Scale = 1f });
                if (root == null)
                {
                    Debug.LogError("[LevelCraft] BatchImportSmoke: Build returned null");
                    EditorApplication.Exit(1);
                    return;
                }

                var grid = root.GetComponentInChildren<UnityEngine.Grid>();
                var maps = root.GetComponentsInChildren<UnityEngine.Tilemaps.Tilemap>();
                var elements = root.GetComponentsInChildren<LevelCraftElement>();
                Debug.Log(
                    $"[LevelCraft] BatchImportSmoke OK name={doc.Name} world={doc.WorldWUnit}x{doc.WorldHUnit} " +
                    $"elements={doc.Elements.Count} grid={(grid != null)} tilemaps={maps.Length} " +
                    $"LevelCraftElement={elements.Length}");
                UnityEngine.Object.DestroyImmediate(root);
                EditorApplication.Exit(0);
            }
            catch (System.Exception ex)
            {
                Debug.LogError("[LevelCraft] BatchImportSmoke FAILED: " + ex);
                EditorApplication.Exit(1);
            }
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
                TileAssetFolder = suggestTileFolder
                    ? "Assets/LevelCraftTiles"
                    : null,
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
    }
}
