using UnityEngine;

namespace LevelCraft.Unity
{
    /// <summary>
    /// Root marker for an imported LevelCraft level hierarchy.
    /// </summary>
    public sealed class LevelCraftLevelRoot : MonoBehaviour
    {
        #region 關卡資訊

        /// <summary>Level name from JSON.</summary>
        public string LevelName;

        /// <summary>World width in LevelCraft units.</summary>
        public float WorldWUnit;

        /// <summary>World height in LevelCraft units.</summary>
        public float WorldHUnit;

        /// <summary>Unity units per LevelCraft unit used at import.</summary>
        public float Scale = 1f;

        /// <summary>Spawn marker transform if present.</summary>
        public Transform Spawn;

        #endregion 關卡資訊
    }
}
