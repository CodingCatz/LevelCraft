using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace LevelCraft.Unity.Editor
{
    /// <summary>
    /// Parsed levelcraft/v1 document + coordinate helpers.
    /// Coordinate math is pure (no scene mutation) so it can be unit-tested.
    /// </summary>
    public sealed class LevelCraftDocument
    {
        #region 資料結構

        /// <summary>Type definition row from types[].</summary>
        public sealed class TypeDef
        {
            public string Name;
            public string ColorHex;
            public string Shape;
            public string Category;
            public string Description;
            public bool Movable;
        }

        /// <summary>One element from elements[].</summary>
        public sealed class Element
        {
            public string Id;
            public string Kind;
            public string TypeName;
            public float XUnit;
            public float YUnit;
            public float WUnit;
            public float HUnit;
            public bool HasSize;
            public string Description;
            public readonly Dictionary<string, string> Props = new Dictionary<string, string>();
            public readonly List<string> Links = new List<string>();
            public readonly List<Vector2> PathUnits = new List<Vector2>();
        }

        /// <summary>format field.</summary>
        public string Format;

        /// <summary>Level name.</summary>
        public string Name;

        /// <summary>World size in units.</summary>
        public float WorldWUnit;

        /// <summary>World size in units.</summary>
        public float WorldHUnit;

        /// <summary>Optional spawn in unit space (null if absent).</summary>
        public Vector2? SpawnUnit;

        /// <summary>Type definitions.</summary>
        public readonly List<TypeDef> Types = new List<TypeDef>();

        /// <summary>Elements.</summary>
        public readonly List<Element> Elements = new List<Element>();

        #endregion 資料結構

        #region 類別解析

        /// <summary>
        /// Normalize category; missing / unknown → object (old-file safe).
        /// </summary>
        public static string NormalizeCategory(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "object";
            var c = raw.Trim().ToLowerInvariant();
            switch (c)
            {
                case "solid":
                case "hazard":
                case "object":
                case "decor":
                    return c;
                default:
                    return "object";
            }
        }

        /// <summary>Build type name → category map.</summary>
        public Dictionary<string, string> BuildCategoryMap()
        {
            var map = new Dictionary<string, string>();
            foreach (var t in Types)
            {
                if (string.IsNullOrEmpty(t.Name)) continue;
                map[t.Name] = NormalizeCategory(t.Category);
            }
            return map;
        }

        /// <summary>Resolve category for an element type name.</summary>
        public string ResolveCategory(string typeName, Dictionary<string, string> map = null)
        {
            map = map ?? BuildCategoryMap();
            if (!string.IsNullOrEmpty(typeName) && map.TryGetValue(typeName, out var cat))
                return cat;
            return "object";
        }

        /// <summary>Find type definition by name.</summary>
        public TypeDef FindType(string typeName)
        {
            if (string.IsNullOrEmpty(typeName)) return null;
            foreach (var t in Types)
            {
                if (t.Name == typeName) return t;
            }
            return null;
        }

        /// <summary>Parse #RRGGBB / #RGB into Color; fallback gray.</summary>
        public static Color ParseColor(string hex, Color fallback)
        {
            if (string.IsNullOrEmpty(hex)) return fallback;
            hex = hex.Trim();
            if (hex.StartsWith("#")) hex = hex.Substring(1);
            try
            {
                if (hex.Length == 3)
                {
                    var r = Convert.ToInt32(new string(hex[0], 2), 16) / 255f;
                    var g = Convert.ToInt32(new string(hex[1], 2), 16) / 255f;
                    var b = Convert.ToInt32(new string(hex[2], 2), 16) / 255f;
                    return new Color(r, g, b, 1f);
                }
                if (hex.Length >= 6)
                {
                    var r = Convert.ToInt32(hex.Substring(0, 2), 16) / 255f;
                    var g = Convert.ToInt32(hex.Substring(2, 2), 16) / 255f;
                    var b = Convert.ToInt32(hex.Substring(4, 2), 16) / 255f;
                    return new Color(r, g, b, 1f);
                }
            }
            catch
            {
                // ignore
            }
            return fallback;
        }

        #endregion 類別解析

        #region 座標換算

        /*
         * 座標約定
         * --------
         * LevelCraft 編輯器：Y 向下、矩形以「左上角」為 (xUnit,yUnit)、高度往 +Y（下）長。
         * Unity 2D / Tilemap：Y 向上、格子／物件習慣以「底部」或中心為準。
         *
         * 設世界高度為 worldHUnit（單位），則編輯器 y=0 是頂、y=worldH 是底。
         * 換成 Y 向上、以世界底為 0 的座標：
         *
         *   點：  unityY = (worldHUnit - yUnit) * scale
         *   矩形：底邊 unityY = (worldHUnit - yUnit - hUnit) * scale
         *         高度 unityH = hUnit * scale
         *   X 軸同向：unityX = xUnit * scale
         *
         * Tilemap cell（cellSize = scale）用單位制整數格：
         *   cellX ∈ [floor(xUnit), ceil(xUnit+wUnit) )
         *   cellY ∈ [floor(worldH - yUnit - hUnit), ceil(worldH - yUnit) )
         */

        /// <summary>Point: editor unit → Unity world (Y-up).</summary>
        public static Vector2 PointToUnity(float xUnit, float yUnit, float worldHUnit, float scale)
        {
            return new Vector2(xUnit * scale, (worldHUnit - yUnit) * scale);
        }

        /// <summary>
        /// Rect: editor top-left + size → Unity bottom-left origin + size (Y-up).
        /// </summary>
        public static void RectToUnity(
            float xUnit, float yUnit, float wUnit, float hUnit,
            float worldHUnit, float scale,
            out Vector2 bottomLeft, out Vector2 size)
        {
            bottomLeft = new Vector2(xUnit * scale, (worldHUnit - yUnit - hUnit) * scale);
            size = new Vector2(wUnit * scale, hUnit * scale);
        }

        /// <summary>Rect center in Unity world space.</summary>
        public static Vector2 RectCenterUnity(
            float xUnit, float yUnit, float wUnit, float hUnit,
            float worldHUnit, float scale)
        {
            RectToUnity(xUnit, yUnit, wUnit, hUnit, worldHUnit, scale, out var bl, out var size);
            return bl + size * 0.5f;
        }

        /// <summary>
        /// Inclusive cell range covering a rect on a grid where 1 cell = 1 unit
        /// and cell (0,0) is the bottom-left unit cell of the world.
        /// </summary>
        public static void RectToCellRange(
            float xUnit, float yUnit, float wUnit, float hUnit,
            float worldHUnit,
            out int xMin, out int yMin, out int xMaxInclusive, out int yMaxInclusive)
        {
            xMin = Mathf.FloorToInt(xUnit);
            var xMaxExclusive = Mathf.CeilToInt(xUnit + wUnit);
            if (xMaxExclusive <= xMin) xMaxExclusive = xMin + 1;
            xMaxInclusive = xMaxExclusive - 1;

            yMin = Mathf.FloorToInt(worldHUnit - yUnit - hUnit);
            var yMaxExclusive = Mathf.CeilToInt(worldHUnit - yUnit);
            if (yMaxExclusive <= yMin) yMaxExclusive = yMin + 1;
            yMaxInclusive = yMaxExclusive - 1;
        }

        /// <summary>Path point unit → Unity.</summary>
        public static Vector2 PathPointToUnity(Vector2 unitPoint, float worldHUnit, float scale)
        {
            return PointToUnity(unitPoint.x, unitPoint.y, worldHUnit, scale);
        }

        #endregion 座標換算

        #region JSON 解析

        /// <summary>
        /// Parse levelcraft/v1 JSON text. Uses a minimal hand-rolled parser
        /// (no third-party MiniJSON; JsonUtility cannot represent props dictionaries).
        /// </summary>
        public static LevelCraftDocument Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                throw new ArgumentException("LevelCraft JSON is empty");

            var root = MiniJson.Deserialize(json) as Dictionary<string, object>;
            if (root == null)
                throw new ArgumentException("LevelCraft JSON root must be an object");

            var doc = new LevelCraftDocument
            {
                Format = GetString(root, "format"),
                Name = GetString(root, "name") ?? "level",
            };

            if (!string.IsNullOrEmpty(doc.Format) && doc.Format != "levelcraft/v1")
                throw new ArgumentException($"Unsupported format \"{doc.Format}\" (need levelcraft/v1)");

            var world = GetDict(root, "world");
            if (world == null)
                throw new ArgumentException("Missing world");
            doc.WorldWUnit = GetFloat(world, "wUnit");
            doc.WorldHUnit = GetFloat(world, "hUnit");

            var spawn = GetDict(root, "spawnUnit");
            if (spawn != null)
                doc.SpawnUnit = new Vector2(GetFloat(spawn, "x"), GetFloat(spawn, "y"));

            var types = GetList(root, "types");
            if (types != null)
            {
                foreach (var item in types)
                {
                    var td = item as Dictionary<string, object>;
                    if (td == null) continue;
                    doc.Types.Add(new TypeDef
                    {
                        Name = GetString(td, "name"),
                        ColorHex = GetString(td, "color"),
                        Shape = GetString(td, "shape"),
                        Category = GetString(td, "category"),
                        Description = GetString(td, "description"),
                        Movable = GetBool(td, "movable"),
                    });
                }
            }

            var elements = GetList(root, "elements");
            if (elements == null)
                throw new ArgumentException("Missing elements");

            foreach (var item in elements)
            {
                var ed = item as Dictionary<string, object>;
                if (ed == null) continue;
                var el = new Element
                {
                    Id = GetString(ed, "id"),
                    Kind = GetString(ed, "kind"),
                    TypeName = GetString(ed, "type"),
                    XUnit = GetFloat(ed, "xUnit"),
                    YUnit = GetFloat(ed, "yUnit"),
                    Description = GetString(ed, "description"),
                };
                if (ed.ContainsKey("wUnit") || ed.ContainsKey("hUnit"))
                {
                    el.HasSize = true;
                    el.WUnit = GetFloat(ed, "wUnit", 1f);
                    el.HUnit = GetFloat(ed, "hUnit", 1f);
                }
                else if (el.Kind == "rect")
                {
                    el.HasSize = true;
                    el.WUnit = 1f;
                    el.HUnit = 1f;
                }

                var props = GetDict(ed, "props");
                if (props != null)
                {
                    foreach (var kv in props)
                        el.Props[kv.Key] = kv.Value?.ToString() ?? "";
                }

                var links = GetList(ed, "links");
                if (links != null)
                {
                    foreach (var l in links)
                    {
                        if (l != null) el.Links.Add(l.ToString());
                    }
                }

                var path = GetList(ed, "path");
                if (path != null)
                {
                    foreach (var p in path)
                    {
                        var pd = p as Dictionary<string, object>;
                        if (pd == null) continue;
                        // Export uses { x, y } in units (see editor.js)
                        var px = pd.ContainsKey("xUnit") ? GetFloat(pd, "xUnit") : GetFloat(pd, "x");
                        var py = pd.ContainsKey("yUnit") ? GetFloat(pd, "yUnit") : GetFloat(pd, "y");
                        el.PathUnits.Add(new Vector2(px, py));
                    }
                }

                doc.Elements.Add(el);
            }

            return doc;
        }

        static string GetString(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.TryGetValue(key, out var v) || v == null) return null;
            return v.ToString();
        }

        static float GetFloat(Dictionary<string, object> d, string key, float fallback = 0f)
        {
            if (d == null || !d.TryGetValue(key, out var v) || v == null) return fallback;
            if (v is double dbl) return (float)dbl;
            if (v is float f) return f;
            if (v is int i) return i;
            if (v is long l) return l;
            if (float.TryParse(v.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
                return parsed;
            return fallback;
        }

        static bool GetBool(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.TryGetValue(key, out var v) || v == null) return false;
            if (v is bool b) return b;
            return string.Equals(v.ToString(), "true", StringComparison.OrdinalIgnoreCase);
        }

        static Dictionary<string, object> GetDict(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.TryGetValue(key, out var v)) return null;
            return v as Dictionary<string, object>;
        }

        static List<object> GetList(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.TryGetValue(key, out var v) || v == null) return null;
            if (v is List<object> list) return list;
            return null;
        }

        #endregion JSON 解析
    }

    /// <summary>
    /// Minimal JSON deserializer (object/array/string/number/bool/null).
    /// Single-file, no allocation-heavy framework — enough for levelcraft/v1.
    /// Adapted for LevelCraft only; not a general-purpose JSON library.
    /// </summary>
    internal static class MiniJson
    {
        public static object Deserialize(string json)
        {
            if (json == null) return null;
            return new Parser(json).ParseValue();
        }

        sealed class Parser
        {
            readonly string _json;
            int _i;

            public Parser(string json) { _json = json; }

            public object ParseValue()
            {
                SkipWs();
                if (_i >= _json.Length) return null;
                var c = _json[_i];
                if (c == '{') return ParseObject();
                if (c == '[') return ParseArray();
                if (c == '"') return ParseString();
                if (c == 't' || c == 'f') return ParseBool();
                if (c == 'n') return ParseNull();
                return ParseNumber();
            }

            Dictionary<string, object> ParseObject()
            {
                var dict = new Dictionary<string, object>();
                _i++; // {
                while (true)
                {
                    SkipWs();
                    if (_i >= _json.Length) throw new FormatException("Unterminated object");
                    if (_json[_i] == '}') { _i++; break; }
                    var key = ParseString();
                    SkipWs();
                    if (_i >= _json.Length || _json[_i] != ':') throw new FormatException("Expected ':'");
                    _i++;
                    var val = ParseValue();
                    dict[key] = val;
                    SkipWs();
                    if (_i < _json.Length && _json[_i] == ',') { _i++; continue; }
                    if (_i < _json.Length && _json[_i] == '}') { _i++; break; }
                    throw new FormatException("Expected ',' or '}' in object");
                }
                return dict;
            }

            List<object> ParseArray()
            {
                var list = new List<object>();
                _i++; // [
                while (true)
                {
                    SkipWs();
                    if (_i >= _json.Length) throw new FormatException("Unterminated array");
                    if (_json[_i] == ']') { _i++; break; }
                    list.Add(ParseValue());
                    SkipWs();
                    if (_i < _json.Length && _json[_i] == ',') { _i++; continue; }
                    if (_i < _json.Length && _json[_i] == ']') { _i++; break; }
                    throw new FormatException("Expected ',' or ']' in array");
                }
                return list;
            }

            string ParseString()
            {
                if (_json[_i] != '"') throw new FormatException("Expected string");
                _i++;
                var sb = new StringBuilder();
                while (_i < _json.Length)
                {
                    var c = _json[_i++];
                    if (c == '"') return sb.ToString();
                    if (c == '\\')
                    {
                        if (_i >= _json.Length) throw new FormatException("Bad escape");
                        var e = _json[_i++];
                        switch (e)
                        {
                            case '"':
                            case '\\':
                            case '/': sb.Append(e); break;
                            case 'b': sb.Append('\b'); break;
                            case 'f': sb.Append('\f'); break;
                            case 'n': sb.Append('\n'); break;
                            case 'r': sb.Append('\r'); break;
                            case 't': sb.Append('\t'); break;
                            case 'u':
                                if (_i + 4 > _json.Length) throw new FormatException("Bad unicode escape");
                                var hex = _json.Substring(_i, 4);
                                _i += 4;
                                sb.Append((char)Convert.ToInt32(hex, 16));
                                break;
                            default: sb.Append(e); break;
                        }
                    }
                    else sb.Append(c);
                }
                throw new FormatException("Unterminated string");
            }

            object ParseNumber()
            {
                var start = _i;
                if (_json[_i] == '-') _i++;
                while (_i < _json.Length && char.IsDigit(_json[_i])) _i++;
                if (_i < _json.Length && _json[_i] == '.')
                {
                    _i++;
                    while (_i < _json.Length && char.IsDigit(_json[_i])) _i++;
                }
                if (_i < _json.Length && (_json[_i] == 'e' || _json[_i] == 'E'))
                {
                    _i++;
                    if (_i < _json.Length && (_json[_i] == '+' || _json[_i] == '-')) _i++;
                    while (_i < _json.Length && char.IsDigit(_json[_i])) _i++;
                }
                var slice = _json.Substring(start, _i - start);
                if (double.TryParse(slice, NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                    return d;
                throw new FormatException("Invalid number: " + slice);
            }

            object ParseBool()
            {
                if (_json.Substring(_i).StartsWith("true")) { _i += 4; return true; }
                if (_json.Substring(_i).StartsWith("false")) { _i += 5; return false; }
                throw new FormatException("Invalid boolean");
            }

            object ParseNull()
            {
                if (_json.Substring(_i).StartsWith("null")) { _i += 4; return null; }
                throw new FormatException("Invalid null");
            }

            void SkipWs()
            {
                while (_i < _json.Length && char.IsWhiteSpace(_json[_i])) _i++;
            }
        }
    }
}
