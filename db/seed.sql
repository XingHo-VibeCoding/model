-- ============================================================================
-- seed.sql —— 「想吃啥」种子数据脚本
-- ============================================================================
-- 作用：把数据库**重置**成一份带示例数据的干净状态。
--
-- ⚠️ 它是「先删 → 再建 → 再插」，所以：
--    · 开发阶段：随便跑，跑多少次结果都一样（可重复执行）—— 这就是它存在的意义
--    · 🔴 **上线后禁止再跑**：它会删表，跑一次就把真实数据全清空。
--      上线后的数据变更一律用「只加不删」的增量 SQL。
--
-- ⚠️ 关于「可复现」：时间字段全部写死成固定值，不用 now()。
--    否则每跑一次时间都不一样，就没法对比"两次跑的结果是否相同"了。
--
-- ⚠️ 建表部分是从 db/schema.sql 复制来的（由脚本自动同步，不是手抄）。
--    改表结构请改 schema.sql，然后重新生成这个文件。
--
-- 生成方式：见仓库外的 _gen_seed.py（它负责把 schema + 真实数据拼成这个文件）
-- ============================================================================


-- ============================================================================
-- schema.sql —— 「想吃啥」建表脚本
-- ============================================================================
-- 依据：仓库根目录 api-contract.md 第二节「数据表」
-- 环境：云开发 PostgreSQL 版（PostgreSQL 17）
--
-- 这个脚本是**幂等**的：开头先 DROP，所以跑 1 次和跑 100 次结果一样。
-- 开发阶段随便推倒重来；**上线后不要跑** —— 它会把表连数据一起删掉。
--
-- ⚠️ 改表结构时，db/seed.sql 里有一份同样的建表语句（那份让种子脚本能独立执行），
--    **两个文件要同步改**，改完用 diff 校验一遍。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 先删旧表
-- 顺序不能反：history 有外键指向 items，必须先删引用方
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS history;
DROP TABLE IF EXISTS items;


-- ---------------------------------------------------------------------------
-- 表 1：items —— 候选条目（一道菜，或一家店）
-- ---------------------------------------------------------------------------
CREATE TABLE items (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text        NOT NULL,
  type        text        NOT NULL,
  platform    text        NOT NULL,
  spicy       text        NOT NULL DEFAULT 'any',
  tags        text[]      NOT NULL DEFAULT '{}',
  source      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- 同一份清单里不允许两个同名条目。
  -- 按课程要求：唯一约束只加在**业务字段**上（不掺"用户"概念 —— 本期没有用户体系）。
  CONSTRAINT items_name_key UNIQUE (name),

  -- 名称必须**已经去掉首尾空白**。空白含普通空格和全角空格（U+3000 = chr(12288)）。
  -- 做成约束而不是只靠接口去 trim：错的数据从**任何**入口进来都会被挡住。
  CONSTRAINT items_name_trimmed_chk
    CHECK (name = btrim(name, ' ' || chr(12288))),

  -- 名称 1–20 个字符（char_length 按字符算，中文一个字算一个，不是按字节）
  CONSTRAINT items_name_len_chk
    CHECK (char_length(name) BETWEEN 1 AND 20),

  -- 下面四条把「字段只能是这几个值」钉死在数据库层。
  -- 好处：第 3 周写接口时手滑传错值，会当场被数据库拦下，而不是悄悄存进脏数据。
  CONSTRAINT items_type_chk     CHECK (type     IN ('dish', 'shop')),
  CONSTRAINT items_platform_chk CHECK (platform IN ('mt', 'tb', 'any')),
  CONSTRAINT items_spicy_chk    CHECK (spicy    IN ('none', 'mild', 'medium', 'hot', 'any')),
  CONSTRAINT items_source_chk   CHECK (source   IN ('builtin', 'user'))
);


-- ---------------------------------------------------------------------------
-- 表 2：history —— 推荐历史（抽过什么，抽过几次）
-- ---------------------------------------------------------------------------
CREATE TABLE history (
  id         bigserial   PRIMARY KEY,

  -- 关联字段：指向 items。
  -- ON DELETE SET NULL = 条目被删掉时，这里自动变成 NULL，**而不是**把这条历史一起删掉。
  item_id    text        REFERENCES items (id) ON DELETE SET NULL,

  -- 名称快照：**当时**抽到的是哪个名字。
  -- 为什么快照和外键两个都要？
  --   · 有了 item_id，两张表才"有关系"（能查、能统计、能追溯）
  --   · 有了 item_name，就算那个条目后来被删了（item_id 变 NULL），
  --     历史记录照样显示得出"那天抽的是鸡公煲" —— 这是 PRD 的 J4，
  --     也是当初我一度想"干脆不要外键"的原因。现在两个都留，两头都满足。
  item_name  text        NOT NULL,

  drawn_at   timestamptz NOT NULL DEFAULT now()
);

-- 历史页永远按时间倒序取最近 20 条，给它建个倒序索引
CREATE INDEX history_drawn_at_idx ON history (drawn_at DESC);


-- ---------------------------------------------------------------------------
-- 字段注释（余力加练：解释每个类型为什么这么选）
-- 注释存在数据库里，控制台的表结构页能直接看到 —— 以后别人看表就知道意图。
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  items                  IS '候选条目：一道菜或一家店。首页抽签从这里选，清单页列表也读它。';
COMMENT ON COLUMN items.id               IS '条目标识。内置条目是固定 id（如 b01），用户新增的自动生成 UUID。';
COMMENT ON COLUMN items.name             IS '名称，1–20 字（按字符数，中文一个字算一个）。必须已去除首尾空格（含全角空格）。全清单唯一。';
COMMENT ON COLUMN items.type             IS '类别：dish=菜，shop=店。与 platform 是两个平级维度，不是从属关系。';
COMMENT ON COLUMN items.platform         IS '平台：mt=美团，tb=淘宝闪购，any=不限。业务含义是"去哪个 App 搜这家店"。';
COMMENT ON COLUMN items.spicy            IS '辣度：none/mild/medium/hot/any。any 表示"不限"，过滤时视为通过任何辣度上限。';
COMMENT ON COLUMN items.tags             IS '忌口标签，如 {香菜,海鲜}。用 text[] 而不是另建关联表 —— 本期只做"包含判断"，不需要按标签联查统计；真要统计时再拆表。';
COMMENT ON COLUMN items.source           IS '来源：builtin=内置库，user=用户自己加的。用户条目默认永不被筛掉（产品原则"零门槛"）。';
COMMENT ON COLUMN items.created_at       IS '写入时间，带时区。存 timestamptz 而不是 timestamp：前者随时区正确换算，后者会把时区丢掉。';

COMMENT ON TABLE  history                IS '推荐历史：每次抽签记一笔。最多保留最近 20 条（裁剪在存储层做）。';
COMMENT ON COLUMN history.item_id        IS '关联到 items.id。条目被删时自动置 NULL，历史本身保留。';
COMMENT ON COLUMN history.item_name      IS '当时的名称快照。故意冗余存一份：条目删掉后历史仍要能显示名字（PRD J4）。';
COMMENT ON COLUMN history.drawn_at       IS '抽到的时间，带时区。历史页按它倒序。';

COMMENT ON CONSTRAINT items_name_key          ON items IS '唯一约束：同一份清单不允许两个同名条目。';
COMMENT ON CONSTRAINT items_name_trimmed_chk  ON items IS '名称不得带首尾空白（普通空格与全角空格 U+3000 都算）。';


-- ---------------------------------------------------------------------------
-- 示例数据 · 表 1：items（11 条：6 道菜 + 5 家店）
-- id 全部写死，保证每次跑插进去的都是同一批、同一个 id。
-- ---------------------------------------------------------------------------
INSERT INTO items (id, name, type, platform, spicy, tags, source, created_at) VALUES
  ('b01', '皮蛋瘦肉粥', 'dish', 'mt', 'none', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b02', '番茄鸡蛋面', 'dish', 'tb', 'none', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b03', '清蒸鲈鱼', 'dish', 'mt', 'none', ARRAY['海鲜'], 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b04', '白切鸡', 'dish', 'tb', 'none', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b05', '玉米排骨汤', 'dish', 'mt', 'none', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b06', '鲜虾云吞面', 'dish', 'tb', 'none', ARRAY['海鲜', '虾'], 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b36', '沙县小吃', 'shop', 'mt', 'any', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b37', '兰州拉面', 'shop', 'tb', 'mild', ARRAY['香菜', '牛肉'], 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b38', '张亮麻辣烫', 'shop', 'mt', 'medium', ARRAY['香菜'], 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b39', '遇见小面', 'shop', 'tb', 'mild', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('b40', '喜家德虾仁水饺', 'shop', 'mt', 'none', '{}', 'builtin', '2026-10-04 10:00:00+08'::timestamptz),
  ('u01', '肯德基', 'shop', 'mt', 'any', '{}', 'user', '2026-10-04 11:00:00+08'::timestamptz);


-- ---------------------------------------------------------------------------
-- 示例数据 · 表 2：history（8 条，按时间倒序）
-- ⚠️ 最后一条的 item_id 是 NULL —— 这是**故意的**：
--    模拟"那个条目后来被删了"，用来演示 item_name 快照的价值
--    （条目没了，历史里照样显示得出名字）。
-- ---------------------------------------------------------------------------
INSERT INTO history (item_id, item_name, drawn_at) VALUES
  ('b38', '张亮麻辣烫', '2026-10-04 12:30:00+08'::timestamptz),
  ('b03', '清蒸鲈鱼', '2026-10-04 12:05:00+08'::timestamptz),
  ('b37', '兰州拉面', '2026-10-03 12:40:00+08'::timestamptz),
  ('b06', '鲜虾云吞面', '2026-10-03 12:10:00+08'::timestamptz),
  ('b40', '喜家德虾仁水饺', '2026-10-02 13:00:00+08'::timestamptz),
  ('b01', '皮蛋瘦肉粥', '2026-10-02 11:50:00+08'::timestamptz),
  ('b04', '白切鸡', '2026-10-01 12:20:00+08'::timestamptz),
  (NULL, '已删掉的那家店', '2026-10-01 11:30:00+08'::timestamptz);
