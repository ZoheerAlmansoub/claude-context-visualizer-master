# دليل Agent Session Intelligence

> **Agent Session Intelligence** (سابقًا Agent Session Intelligence) — تطبيق ويب محلي لتحليل جلسات وكلاء الذكاء الاصطناعي: فهم استهلاك السياق (tokens)، تجميع رسائل المستخدم، التحليل بالذكاء الاصطناعي، استخراج المهارات والقواعد، واكتشاف المشاكل المتكررة.

---

## ما هذه الأداة؟

عند العمل مع Claude Code أو Cursor أو Pi أو OpenCode، تتراكم المحادثات في ملفات transcript على جهازك. هذه الأداة تقرأ تلك الجلسات **محليًا** (بدون رفعها لسحابة) وتعرض:

1. **من أين تأتي التوكنز؟** — رسائل النظام، المستخدم، الأدوات، المرفقات، والتفكير.
2. **ماذا طلب المستخدم؟** — كل رسائل المستخدم مرتبة مع أرقام الأدوار.
3. **ما المشاكل المتكررة؟** — حلقات إعادة المحاولة، أخطاء الأدوات، هدر السياق.
4. **كيف أحسّن الوكيل؟** — تحليل LLM، مسودات skills/rules، وحوكمة المشروع.

كل المعالجة على `localhost` — البيانات لا تغادر جهازك إلا عند استدعاء مزود LLM الذي تختاره للتحليل.

---

## المتطلبات

- [Bun](https://bun.sh) — لتشغيل الخادم وبناء الواجهة
- Node/npm (اختياري) — `start.ps1` يستخدم npm لـ `web/` إن لزم

---

## التثبيت والتشغيل

```powershell
# 1. تثبيت الاعتماديات
bun install
cd web && bun install && cd ..

# 2. إعداد المفاتيح (محليًا فقط — لا تُرفع)
cp .env.example .env
# عدّل .env وأضف مفاتيح API

# 3. (موصى به) تفعيل فحص الأسرار قبل كل commit
.\scripts\install-git-hooks.ps1

# 4. التشغيل
.\start.ps1
```

- **الواجهة:** http://localhost:5173  
- **API:** http://localhost:5174  

أو: `bun run dev`

---

## مصادر الجلسات المدعومة

| الوكيل | مسار البيانات |
|--------|---------------|
| **Claude Code** | `~/.claude/projects/**/*.jsonl` |
| **Pi** | `~/.pi/agent/sessions/**/*.jsonl` |
| **Cursor** | `~/.cursor/projects/*/agent-transcripts/*/*.jsonl` |
| **OpenCode** | `~/.local/share/opencode/opencode.db` (SQLite) أو JSON legacy |

عند الفتح، تظهر قائمة الجلسات في الشريط الجانبي. اختر جلسة لعرض تفاصيلها.

---

## واجهة التطبيق — التبويبات

### 1. Context (السياق)

- **Treemap / Sunburst / Bar** — تصور بصري لتوزيع التوكنز.
- **Drill-down** — انقر على أي جزء لرؤية المحتوى الفعلي (رسائل، نتائج أدوات، مرفقات).
- **Headline stats** — إجمالي input/output، cache read/write، compaction boundaries.
- **Calibration** — تقدير محلي بـ `cl100k_base` مع معامل تصحيح عند توفر usage من API.

**الفائدة:** تعرف أي أداة أو رسالة «تأكل» السياق قبل compaction.

### 2. Messages (الرسائل)

- كل رسائل المستخدم زمنيًا مع رقم الدور (turn).
- نسخ رسالة واحدة أو الكل (Markdown أو plain text).
- فلتر **Post-compaction** — رسائل بعد ضغط السياق فقط.

**الفائدة:** مراجعة سريعة لما طلبته فعلًا دون ضجيج ردود الوكيل.

### 3. Analysis (التحليل — يتطلب LLM)

19 نوع تحليل مقسمة لفئات:

| الفئة | أنواع التحليل |
|-------|---------------|
| **نظرة عامة** | summarize, intent-map, experience-extract, session-review |
| **السياق والتوكنز** | token-audit, compaction-recovery |
| **الحلقات والأدوات** | loop-diagnosis, tool-hardening, mcp-tool-audit |
| **Artifacts والذاكرة** | artifact-blueprint, memory-file-drafts, agent-orchestration |
| **الحوكمة** | project-health, user-ai-fluency, growth-plan, memory-diff, rule-dedup, project-synthesis |
| **التعلّم** | agentic-lessons |

**Analysis Pipeline Wizard** — سير عمل موجّه: summarize → token audit → loop diagnosis → artifact blueprint → memory drafts، مع **Apply Pack** اختياري في النهاية.

النتائج تُعرض كبطاقات JSON منظمة مع أزرار نسخ/حفظ.

### 4. Governance (الحوكمة)

- **Session pipeline** — Quick / Standard / Full على جلسة واحدة.
- **Project pipeline** — تحليل عبر جلسات المشروع.
- يقرأ `AGENTS.md`, `CLAUDE.md`, rules, skills من قرص المشروع.
- **Auto-apply** — تطبيق artifacts عالية/متوسطة الثقة تلقائيًا (اختياري).
- **Scheduled refresh** — حوكمة المشروع عند عدد جلسات جديدة.
- تصدير playbook إلى `docs/governance/`.

### 5. Artifacts

- توليد **skills**, **rules**, hooks, sub-agent specs من أنماط الجلسة.
- قوالب مرتبطة بالأنماط: retry loops, tool errors, token waste, compaction pressure.
- مسارات متعددة الوكلاء (Cursor, Claude Code, Pi, OpenCode).
- **Apply Pack** — تطبيق دفعة على القرص مع دمج ملفات الذاكرة.

### 6. Insights

- أنماط على مستوى الجلسة.
- أنماط متكررة عبر جلسات المشروع مع اقتراح artifacts.

---

## إعداد مزودي LLM

### الطريقة 1: ملف `.env` (محلي)

```env
NVIDIA_API_KEY=...
DEFAULT_LLM_PROVIDER=nvidia
DEFAULT_LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

### الطريقة 2: Settings → LLM في التطبيق

- يحفظ في `.cache/llm-settings.json` (gitignored).
- يُحمّل مباشرة دون إعادة تشغيل.
- `.env` يُستخدم كـ fallback عند غياب القيمة في الملف المحفوظ.

### المزودون المدعومون

Anthropic, OpenAI, OpenRouter, OpenCode Zen, Groq, DeepSeek, Ollama, NVIDIA NIM.

---

## الأمان — المفاتيح والأسرار

> **مهم:** لا تضع مفاتيح API حقيقية في `.env.example` أو أي ملف متتبع في Git.

| الملف | آمن للرفع؟ |
|-------|------------|
| `.env` | ❌ لا — محلي فقط |
| `.cache/` | ❌ لا |
| `.env.example` | ✅ نعم — قيم فارغة فقط |

```powershell
# فحص قبل الدفع
bun run check:secrets

# تفعيل pre-commit
.\scripts\install-git-hooks.ps1
```

إذا سُرّبت مفاتيح سابقًا: **أبطِلها فورًا** من لوحة المزود، ثم راجع [SECURITY.md](../SECURITY.md) لتنظيف سجل Git.

---

## API محلي

| المسار | الوظيفة |
|--------|---------|
| `GET /api/health` | فحص صحة الخادم |
| `GET /api/sessions` | قائمة الجلسات |
| `GET /api/sessions/:id/snapshot` | تفصيل التوكنز |
| `GET /api/sessions/:id/transcript` | النص الكامل |
| `POST /api/sessions/:id/analyze` | تحليل LLM |
| `POST /api/sessions/:id/govern` | pipeline حوكمة الجلسة |
| `POST /api/projects/:slug/govern` | pipeline حوكمة المشروع |
| `GET /api/config/llm` | إعدادات LLM (بدون أسرار) |

---

## هيكل المشروع

```
server/          — Bun API، transcript engine، LLM، insights
web/             — React + Vite
scripts/         — smoke tests، فحص الأسرار
docs/            — roadmap ودليل عربي
.cache/          — إعدادات LLM، cache pipelines (محلي)
.env             — مفاتيحك (محلي)
```

---

## سيناريوهات استخدام شائعة

1. **«السياق امتلأ بسرعة»** → Context tab → token audit → compaction-recovery.
2. **«الوكيل يعيد نفس الخطأ»** → Insights → loop-diagnosis → tool-hardening → rule artifact.
3. **«أريد skills من هذه الجلسة»** → Analysis → artifact-blueprint → Artifacts → Apply Pack.
4. **«مراجعة مشروع كامل»** → Project Dashboard → Govern (Standard/Full).

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| لا تظهر جلسات | تحقق من مسارات الوكيل أعلاه |
| Analysis يفشل | تحقق من LLM settings ومفتاح API |
| OpenCode فارغ | تأكد من وجود `opencode.db` أو JSON legacy |
| Port مشغول | `start.ps1` يوقف 5173/5174 تلقائيًا |

---

## الترخيص

[GPL-3.0-or-later](../LICENSE)

---

**English documentation:** [README.md](../README.md)
