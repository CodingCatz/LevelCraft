using System.IO;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace LevelCraft.Unity.Editor
{
    /// <summary>
    /// Optional ScriptedImporter for <c>*.levelcraft</c> files (JSON content, custom extension).
    /// Preferred workflow for plain LevelCraft <c>.json</c> exports is still the menu:
    /// <c>Assets → LevelCraft → Import Level JSON…</c> — no rename required.
    /// </summary>
    [ScriptedImporter(1, "levelcraft")]
    public sealed class LevelCraftJsonScriptedImporter : ScriptedImporter
    {
        #region 設定

        /// <summary>Unity units per LevelCraft unit.</summary>
        public float scale = 1f;

        #endregion 設定

        /// <summary>Build a hierarchy asset from the file contents.</summary>
        public override void OnImportAsset(AssetImportContext ctx)
        {
            var text = File.ReadAllText(ctx.assetPath);
            var doc = LevelCraftDocument.Parse(text);
            var root = LevelCraftLevelBuilder.Build(doc, new LevelCraftLevelBuilder.Options
            {
                Scale = scale <= 0f ? 1f : scale,
            });

            // Register entire hierarchy as sub-assets so the import is self-contained.
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                var go = t.gameObject;
                if (go == root) continue;
                ctx.AddObjectToAsset(go.name + "_" + go.GetInstanceID(), go);
            }

            ctx.AddObjectToAsset("main", root);
            ctx.SetMainObject(root);
        }
    }
}
