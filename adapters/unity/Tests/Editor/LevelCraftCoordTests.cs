// EditMode tests live under Tests/Editor + LevelCraft.Unity.Tests.asmdef so they
// compile into an Editor test assembly that references LevelCraft.Unity.Editor.
// Putting them under Tests/ (runtime) caused CS0234: LevelCraft.Unity.Editor missing.
using System;
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

        [Test]
        public void Parse_AgreedStructure_DemoLevel()
        {
            // Same shape as adapters/phaser/example/level-demo.json (levelcraft/v1).
            const string json = @"{
              ""format"": ""levelcraft/v1"",
              ""name"": ""phaser-demo"",
              ""world"": { ""wUnit"": 30, ""hUnit"": 16 },
              ""snap"": 0.5,
              ""spawnUnit"": { ""x"": 2, ""y"": 12 },
              ""types"": [
                { ""name"": ""ground"", ""color"": ""#5568d3"", ""shape"": ""rect"", ""category"": ""solid"" },
                { ""name"": ""spike"", ""color"": ""#fc8181"", ""shape"": ""rect"", ""category"": ""hazard"" },
                { ""name"": ""switch"", ""color"": ""#f687b3"", ""shape"": ""point"", ""category"": ""object"" },
                { ""name"": ""door"", ""color"": ""#b794f4"", ""shape"": ""point"", ""category"": ""object"" },
                { ""name"": ""bush"", ""color"": ""#68d391"", ""shape"": ""rect"", ""category"": ""decor"" }
              ],
              ""elements"": [
                { ""id"": ""floor"", ""kind"": ""rect"", ""type"": ""ground"",
                  ""xUnit"": 0, ""yUnit"": 14, ""wUnit"": 30, ""hUnit"": 2 },
                { ""id"": ""spikes"", ""kind"": ""rect"", ""type"": ""spike"",
                  ""xUnit"": 11, ""yUnit"": 13, ""wUnit"": 3, ""hUnit"": 1 },
                { ""id"": ""sw1"", ""kind"": ""point"", ""type"": ""switch"",
                  ""xUnit"": 7.5, ""yUnit"": 10, ""links"": [""door1""],
                  ""props"": { ""once"": ""true"" } },
                { ""id"": ""door1"", ""kind"": ""point"", ""type"": ""door"",
                  ""xUnit"": 20, ""yUnit"": 12.5 },
                { ""id"": ""bush1"", ""kind"": ""rect"", ""type"": ""bush"",
                  ""xUnit"": 4, ""yUnit"": 12, ""wUnit"": 1, ""hUnit"": 1 }
              ]
            }";
            var doc = LevelCraftDocument.Parse(json);
            Assert.AreEqual("levelcraft/v1", doc.Format);
            Assert.AreEqual(30f, doc.WorldWUnit, 1e-5f);
            Assert.AreEqual(16f, doc.WorldHUnit, 1e-5f);
            Assert.IsTrue(doc.SpawnUnit.HasValue);
            Assert.AreEqual(2f, doc.SpawnUnit.Value.x, 1e-5f);
            Assert.AreEqual(5, doc.Elements.Count);
            Assert.AreEqual("solid", doc.ResolveCategory("ground"));
            Assert.AreEqual("hazard", doc.ResolveCategory("spike"));
            Assert.AreEqual("object", doc.ResolveCategory("switch"));
            Assert.AreEqual("decor", doc.ResolveCategory("bush"));

            LevelCraftDocument.RectToUnity(0f, 14f, 30f, 2f, doc.WorldHUnit, 1f, out var bl, out var size);
            Assert.AreEqual(0f, bl.y, 1e-5f);
            Assert.AreEqual(2f, size.y, 1e-5f);
        }

        [Test]
        public void Parse_Rejects_IntermediateRoom_WithActionableMessage()
        {
            const string json = @"{
              ""sourceMap"": ""0-Intro"",
              ""sourceRoom"": ""lvl_-1"",
              ""widthTiles"": 40,
              ""heightTiles"": 23,
              ""solids"": [ ""0001"", ""1111"" ],
              ""entities"": [ { ""name"": ""player"", ""x"": 1, ""y"": 2 } ]
            }";
            var ex = Assert.Throws<ArgumentException>(() => LevelCraftDocument.Parse(json));
            StringAssert.Contains("intermediate", ex.Message.ToLowerInvariant());
            StringAssert.Contains("0-Intro", ex.Message);
            StringAssert.DoesNotContain("Missing world", ex.Message);
        }

        [Test]
        public void Parse_Rejects_IntermediateIndex_WithActionableMessage()
        {
            const string json = @"{
              ""count"": 2,
              ""rooms"": [
                { ""file"": ""0-Intro__lvl_-1.json"", ""sourceMap"": ""0-Intro"", ""sourceRoom"": ""lvl_-1"" },
                { ""file"": ""0-Intro__lvl_0.json"", ""sourceMap"": ""0-Intro"", ""sourceRoom"": ""lvl_0"" }
              ]
            }";
            var ex = Assert.Throws<ArgumentException>(() => LevelCraftDocument.Parse(json));
            StringAssert.Contains("index", ex.Message.ToLowerInvariant());
            StringAssert.DoesNotContain("Missing world", ex.Message);
        }

        [Test]
        public void Parse_BOM_Prefixed_Levelcraft_Ok()
        {
            const string body = @"{
              ""format"": ""levelcraft/v1"",
              ""name"": ""bom"",
              ""world"": { ""wUnit"": 8, ""hUnit"": 6 },
              ""elements"": [
                { ""id"": ""a"", ""kind"": ""point"", ""type"": ""goal"", ""xUnit"": 1, ""yUnit"": 2 }
              ]
            }";
            var doc = LevelCraftDocument.Parse("\uFEFF" + body);
            Assert.AreEqual(8f, doc.WorldWUnit, 1e-5f);
            Assert.AreEqual(1, doc.Elements.Count);
        }
    }
}
