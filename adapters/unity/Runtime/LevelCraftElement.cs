// 掛在匯入物件上的 LevelCraft 元素資料（id、類型、category、props、links、路徑），遊戲執行期讀取用。

using System;
using System.Collections.Generic;
using UnityEngine;

namespace LevelCraft.Unity
{
    /// <summary>
    /// Runtime metadata for one LevelCraft element (object / point / optional hazard GO).
    /// Links are resolved to scene object references after import when possible.
    /// </summary>
    public sealed class LevelCraftElement : MonoBehaviour
    {
        #region 識別

        /// <summary>Element id from levelcraft/v1 JSON.</summary>
        public string Id;

        /// <summary>Type name (ground, switch, …).</summary>
        public string TypeName;

        /// <summary>Game category: solid / hazard / object / decor.</summary>
        public string Category;

        /// <summary>Optional human description.</summary>
        public string Description;

        #endregion 識別

        #region 屬性與連動

        /// <summary>Custom props keys (parallel to PropValues).</summary>
        public string[] PropKeys = Array.Empty<string>();

        /// <summary>Custom props values (parallel to PropKeys).</summary>
        public string[] PropValues = Array.Empty<string>();

        /// <summary>Raw link target ids from JSON.</summary>
        public string[] LinkIds = Array.Empty<string>();

        /// <summary>Resolved link targets in the same level (may be shorter if missing).</summary>
        public LevelCraftElement[] LinkedElements = Array.Empty<LevelCraftElement>();

        /// <summary>
        /// Path waypoints in Unity world space (Y-up): where the element center is at each node.
        /// Empty when the element has no path.
        /// </summary>
        public Vector2[] Path = Array.Empty<Vector2>();

        /// <summary>
        /// Path as displacement from the element's placed position at each node (Unity units, Y-up).
        /// Add to the transform position to move the element along its path; same length as <see cref="Path"/>.
        /// </summary>
        public Vector2[] PathOffset = Array.Empty<Vector2>();

        #endregion 屬性與連動

        #region 查詢

        /// <summary>Lookup a prop by key; returns null if missing.</summary>
        public string GetProp(string key)
        {
            if (string.IsNullOrEmpty(key) || PropKeys == null) return null;
            for (int i = 0; i < PropKeys.Length; i++)
            {
                if (PropKeys[i] == key)
                    return i < PropValues.Length ? PropValues[i] : null;
            }
            return null;
        }

        /// <summary>Build a dictionary view of props (allocates).</summary>
        public Dictionary<string, string> PropsToDictionary()
        {
            var dict = new Dictionary<string, string>();
            if (PropKeys == null) return dict;
            for (int i = 0; i < PropKeys.Length; i++)
            {
                var k = PropKeys[i];
                if (string.IsNullOrEmpty(k)) continue;
                dict[k] = i < PropValues.Length ? PropValues[i] : null;
            }
            return dict;
        }

        #endregion 查詢
    }
}
