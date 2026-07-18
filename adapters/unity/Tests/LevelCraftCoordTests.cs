#if UNITY_INCLUDE_TESTS || UNITY_EDITOR
using NUnit.Framework;
using UnityEngine;
using LevelCraft.Unity.Editor;

namespace LevelCraft.Unity.Tests
{
    /// <summary>
    /// EditMode tests for Y-flip / anchor conversion and JSON category fallback.
    /// Run via Unity Test Runner (EditMode). Also mirrored by adapters/unity/check-coords.cjs.
    /// </summary>
    public sealed class LevelCraftCoordTests
    {
        const float WorldH = 16f;
        const float Scale = 1f;

        [Test]
        public void Point_YDown_To_YUp()
        {
            // Editor y=0 at top → Unity y = worldH
            var top = LevelCraftDocument.PointToUnity(3f, 0f, WorldH, Scale);
            Assert.AreEqual(3f, top.x, 1e-5f);
            Assert.AreEqual(16f, top.y, 1e-5f);

            // Editor y=12 → 4 from bottom
            var p = LevelCraftDocument.PointToUnity(2f, 12f, WorldH, Scale);
            Assert.AreEqual(2f, p.x, 1e-5f);
            Assert.AreEqual(4f, p.y, 1e-5f);
        }

        [Test]
        public void Rect_TopLeft_To_BottomLeft()
        {
            // Floor at yUnit=14, h=2, worldH=16 → Unity bottom at 0, size 2
            LevelCraftDocument.RectToUnity(0f, 14f, 30f, 2f, WorldH, Scale, out var bl, out var size);
            Assert.AreEqual(0f, bl.x, 1e-5f);
            Assert.AreEqual(0f, bl.y, 1e-5f);
            Assert.AreEqual(30f, size.x, 1e-5f);
            Assert.AreEqual(2f, size.y, 1e-5f);

            var center = LevelCraftDocument.RectCenterUnity(0f, 14f, 30f, 2f, WorldH, Scale);
            Assert.AreEqual(15f, center.x, 1e-5f);
            Assert.AreEqual(1f, center.y, 1e-5f);
        }

        [Test]
        public void Rect_CellRange_MatchesBottomLeft()
        {
            LevelCraftDocument.RectToCellRange(6f, 11f, 5f, 1f, WorldH, out var x0, out var y0, out var x1, out var y1);
            // unity bottom = 16-11-1 = 4 → cells y 4..4, x 6..10
            Assert.AreEqual(6, x0);
            Assert.AreEqual(10, x1);
            Assert.AreEqual(4, y0);
            Assert.AreEqual(4, y1);
        }

        [Test]
        public void Scale_Multiplies()
        {
            var p = LevelCraftDocument.PointToUnity(2f, 12f, WorldH, 32f);
            Assert.AreEqual(64f, p.x, 1e-4f);
            Assert.AreEqual(128f, p.y, 1e-4f); // (16-12)*32
        }

        [Test]
        public void Parse_Category_Fallback_Object()
        {
            const string json = @"{
              ""format"": ""levelcraft/v1"",
              ""name"": ""old"",
              ""world"": { ""wUnit"": 10, ""hUnit"": 10 },
              ""types"": [ { ""name"": ""ground"", ""shape"": ""rect"" } ],
              ""elements"": [
                { ""id"": ""a"", ""kind"": ""rect"", ""type"": ""ground"",
                  ""xUnit"": 0, ""yUnit"": 0, ""wUnit"": 2, ""hUnit"": 1 }
              ]
            }";
            var doc = LevelCraftDocument.Parse(json);
            Assert.AreEqual("object", doc.ResolveCategory("ground"));
            Assert.AreEqual("object", LevelCraftDocument.NormalizeCategory(null));
            Assert.AreEqual("object", LevelCraftDocument.NormalizeCategory("nope"));
            Assert.AreEqual("solid", LevelCraftDocument.NormalizeCategory("SOLID"));
        }

        [Test]
        public void Parse_Links_And_Path()
        {
            const string json = @"{
              ""format"": ""levelcraft/v1"",
              ""name"": ""links"",
              ""world"": { ""wUnit"": 20, ""hUnit"": 10 },
              ""types"": [
                { ""name"": ""switch"", ""category"": ""object"" },
                { ""name"": ""door"", ""category"": ""object"" },
                { ""name"": ""ground"", ""category"": ""solid"" }
              ],
              ""elements"": [
                { ""id"": ""sw1"", ""kind"": ""point"", ""type"": ""switch"",
                  ""xUnit"": 3, ""yUnit"": 6, ""links"": [""door1""],
                  ""props"": { ""once"": ""true"" } },
                { ""id"": ""door1"", ""kind"": ""point"", ""type"": ""door"",
                  ""xUnit"": 15, ""yUnit"": 6 },
                { ""id"": ""plat"", ""kind"": ""rect"", ""type"": ""ground"",
                  ""xUnit"": 4, ""yUnit"": 4, ""wUnit"": 3, ""hUnit"": 1,
                  ""path"": [ { ""x"": 6, ""y"": 4 }, { ""x"": 8, ""y"": 4 } ] }
              ]
            }";
            var doc = LevelCraftDocument.Parse(json);
            Assert.AreEqual(3, doc.Elements.Count);
            var sw = doc.Elements[0];
            Assert.AreEqual("door1", sw.Links[0]);
            Assert.AreEqual("true", sw.Props["once"]);
            Assert.AreEqual("solid", doc.ResolveCategory("ground"));

            var plat = doc.Elements[2];
            Assert.AreEqual(2, plat.PathUnits.Count);
            var p0 = LevelCraftDocument.PathPointToUnity(plat.PathUnits[0], doc.WorldHUnit, 1f);
            // y=4 → unityY = 10-4 = 6
            Assert.AreEqual(6f, p0.x, 1e-5f);
            Assert.AreEqual(6f, p0.y, 1e-5f);
        }
    }
}
#endif
