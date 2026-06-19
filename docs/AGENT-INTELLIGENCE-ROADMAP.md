# Agent Session Intelligence — Roadmap & Gap Closure Plan

> آخر تحديث: 2026-06-19  
> يغطي: ما اكتمل، الفجوات المتبقية، وخطة التنفيذ (بما فيها OpenCode transcripts).

---

## 1. الحالة الحالية (منفّذ ومنتج)

### 1.1 التحليلات (19 نوع)

| الفئة | الأنواع |
|-------|---------|
| Overview | `summarize`, `intent-map`, `experience-extract`, `session-review` |
| Context & tokens | `token-audit`, `compaction-recovery` |
| Loops & tools | `loop-diagnosis`, `tool-hardening`, `mcp-tool-audit` |
| Artifacts & memory | `artifact-blueprint`, `memory-file-drafts`, `agent-orchestration` |
| Governance | `project-health-report`, `user-ai-fluency`, `user-growth-plan`, `memory-diff`, `rule-dedup`, `project-synthesis` |
| Learning | `agentic-lessons` |

- JSON structured → بطاقات UI + copy/save
- Heuristic hybrid عند فشل LLM أو patterns من cross-session
- Analysis Pipeline Wizard: summarize → token-audit → loop-diagnosis → artifact-blueprint → memory-file-drafts + Apply Pack

### 1.2 الحوكمة (Governance)

| الميزة | التفاصيل |
|--------|----------|
| أوضاع | Quick / Standard / Full (`server/governance/step-lists.ts`) |
| تنفيذ | Background pipeline + JSON cache (`.cache/pipeline/{id}.json`) |
| تحكم | Cancel / Resume عبر API |
| autoApply | تطبيق artifacts عالية/متوسطة الثقة بعد الاكتمال |
| Playbook | توليد + تصدير إلى `docs/governance/` |
| جدولة | `GOVERNANCE_AUTO_SCHEDULE`, `GOVERNANCE_MIN_NEW_SESSIONS`, `/govern/eligible` |

### 1.3 سياق المشروع

- `loadProjectContext` — AGENTS.md, CLAUDE.md, rules, skills
- `cursorProjectPathCandidates()` — فك ترميز slug متعدد المرشحين + `stat()` للتحقق
- Verified badge في الهيدر وGovernance وDashboard
- APIs: `/context`, `/context/summary`, `/dashboard`

### 1.4 Artifacts & Apply Pack

- مسارات multi-agent (Cursor, Claude, Pi, OpenCode)
- Pattern templates → `suggestedArtifact` (`server/artifacts/templates.ts`)
- Apply Pack: client (`web/src/lib/apply-pack.ts`) + server (`server/artifacts/apply-collector.ts`)
- Merge للملفات (`writeWithMerge`)

### 1.5 Insights

- Session patterns: retry loops, tool errors, token waste, compaction pressure
- Cross-session recurring patterns + enrichment بقوالب artifacts

### 1.6 LLM Providers

Anthropic, OpenAI, OpenRouter, **OpenCode Zen**, Groq, DeepSeek, Ollama, NVIDIA NIM — إعدادات حية في UI.

### 1.7 التحقق

- **38+ unit tests** (parse, templates, schedule, project-context, agents)
- TypeScript نظيف (`web` + `server`)

---

## 2. الفجوات المتبقية (مرتّبة بالأولوية)

### المرحلة A — UX (تأثير مباشر)

| # | الفجوة | الوضع | الملفات المتوقعة |
|---|--------|-------|------------------|
| A1 | خطوات pipeline قابلة للنقر | Governance يعرض status فقط | `GovernancePanel.tsx`, `api.getAnalysis` |
| A2 | عرض `suggestedArtifact` في بطاقات الأنماط | Backend فقط | `GovernancePanel.tsx`, `ProjectDashboard.tsx` |
| A3 | `project-synthesis` — قسم `decisions` | غير معروض في البطاقة | `AnalysisResultCards.tsx` |
| A4 | تعريب نصوص متبقية | autoApply, drift warnings | `GovernancePanel.tsx`, `AnalysisResultCards.tsx` |
| A5 | Smoke test متصفح | Dashboard, Wizard, govern | manual / browser MCP |

### المرحلة B — أتمتة

| # | الفجوة | الوضع | الملفات المتوقعة |
|---|--------|-------|------------------|
| B1 | Trigger تلقائي للحوكمة | eligibility فقط | `server/governance/schedule.ts`, `index.ts`, UI |
| B2 | سجل pipelines في Dashboard | `lastRunAt` فقط | `.cache/pipeline/` index API |
| B3 | إشعار عند اكتمال pipeline | polling صامت | `GovernancePanel.tsx` toast/badge |

### المرحلة C — ثقة إنتاجية

| # | الفجوة | الوضع | الملفات المتوقعة |
|---|--------|-------|------------------|
| C1 | Tests `apply-collector` | غير موجود | `server/artifacts/apply-collector.test.ts` |
| C2 | Pipeline integration test | mock `runAnalysis` | `server/governance/pipeline.test.ts` |
| C3 | OpenCode loader tests | fixtures | `server/fixtures/opencode/`, `opencode-loader.test.ts` |
| C4 | Eval harness | غير موجود | reference sessions + rubrics |

### المرحلة D — AI حديث (استراتيجي)

| # | الميزة | الهدف |
|---|--------|-------|
| D1 | Eval loop | قياس جودة التحليل وليس parse success فقط |
| D2 | Grounding score | التحقق من استشهاد memory-diff بملفات حقيقية |
| D3 | SSE streaming | progress أثناء pipeline بدل polling |
| D4 | Synthesis memory | cache تدريجي لـ `project-synthesis` |
| D5 | Multi-model review | نموذج ثانٍ يراجع artifacts قبل autoApply |

---

## 3. OpenCode Transcripts — خطة التنفيذ

> **ملاحظة:** OpenCode Zen (LLM provider) ≠ OpenCode session storage. Zen منفّذ؛ transcripts كان stub.

### 3.1 تنسيق التخزين (OpenCode upstream)

**Primary (OpenCode ≥ SQLite migration):**
```
~/.local/share/opencode/opencode.db   # SQLite: session, message, part, project tables
~/.local/share/opencode/storage/session_diff/{sessionID}.json  # file diffs only
```

**Legacy (file-based JSON):**
```
~/.local/share/opencode/storage/
├── session/{projectID}/{sessionID}.json
├── message/{sessionID}/{messageID}.json
├── part/{messageID}/{partID}.json
└── project/{projectID}.json
```

**MessageV2.Part types:** text, reasoning, file, tool, compaction, step-start/finish, snapshot, patch, agent, subtask, retry.

### 3.2 عقد المسار الافتراضي (session ref)

```
{storageDir}/session/{projectId}/{sessionId}.json
```

- `filePath` في `SessionListItem` يشير لهذا الملف
- `loadOpenCodeRecords(filePath)` يقرأ session + messages + parts

### 3.3 مراحل التنفيذ

| Phase | المهمة | الحالة |
|-------|--------|--------|
| OC-A | `listOpenCodeProjects` / `listOpenCodeSessions` / `findOpenCodeSessionById` | **منفّذ** |
| OC-B | `loadOpenCodeRecords` — join message/part | **منفّذ** |
| OC-C | `normalizeOpenCodeRecords` → NormalizedRecord | **منفّذ** |
| OC-D | Wire `indexer.ts`, `transcript.ts`, `snapshot.ts` | **منفّذ** |
| OC-E | Fixtures + tests (`server/fixtures/opencode/`) | **منفّذ** |
| OC-F | README + smoke script | **منفّذ** |

### 3.4 التعامل مع التخزين غير الكامل

| الحالة | السلوك |
|--------|--------|
| `message/` + `part/` موجودان | قائمة مشاريع وجلسات كاملة |
| `session_diff` فقط | `unavailableReason` — لا جلسات |
| `session/` بدون messages | مشروع يظهر؛ الجلسة فارغة مع warning |

### 3.5 Normalization mapping

| OpenCode | NormalizedRecord |
|----------|------------------|
| User + TextPart | `{ type: "user", message: { content: [{ type: "text", ... }] } }` |
| Assistant + ToolPart (pending/running) | `tool_use` في assistant content |
| ToolPart completed/error | `tool_result` في user message تالي |
| CompactionPart | `{ type: "system", subtype: "compact_boundary" }` |
| Assistant.tokens | `usage` (input, output, cache.read/write) |
| Assistant.path.cwd | `cwd` للمشروع |

---

## 4. APIs (مرجع كامل)

| Route | Method | الوصف |
|-------|--------|-------|
| `/api/sessions/:id/transcript` | GET | Transcript كامل |
| `/api/sessions/:id/user-messages` | GET | رسائل المستخدم مجمّعة |
| `/api/sessions/:id/analyze` | POST | تحليل LLM (19 نوع) |
| `/api/sessions/:id/generate-artifacts` | POST | توليد skills/rules |
| `/api/sessions/:id/insights` | GET | أنماط الجلسة |
| `/api/insights/recurring?project=` | GET | أنماط cross-session |
| `/api/projects/:slug/context` | GET | ملفات الذاكرة على القرص |
| `/api/projects/:slug/context/summary` | GET | ملخص للـ badge |
| `/api/projects/:slug/dashboard` | GET | إحصائيات + patterns + schedule |
| `/api/projects/:slug/govern/eligible` | GET | أهلية الحوكمة المجدولة |
| `/api/sessions/:id/govern` | POST | pipeline جلسة (`mode`, `autoApply`) |
| `/api/projects/:slug/govern` | POST | pipeline مشروع |
| `/api/governance/:pipelineId` | GET | poll status |
| `/api/governance/:pipelineId/cancel` | POST | إلغاء |
| `/api/governance/:pipelineId/resume` | POST | استئناف |
| `/api/projects/:slug/playbook` | GET | playbook (+ save) |
| `/api/artifacts/apply-pack` | POST | تطبيق دفعي |
| `/api/config/llm` | GET | إعدادات LLM |

---

## 5. متغيرات البيئة (Governance)

```env
GOVERNANCE_AUTO_APPLY=1          # auto-apply بعد pipeline
GOVERNANCE_AUTO_SCHEDULE=1       # تتبع عدد الجلسات
GOVERNANCE_MIN_NEW_SESSIONS=3    # حد الجلسات الجديدة قبل eligible
```

---

## 6. بنية المعمارية

```
Governance:
  POST govern → pipelineId → executePipelineSteps (background)
    → runAnalysis per step → cache JSON
    → optional autoApply (apply-collector)
    → generateProjectPlaybook

Project context:
  slug → cursorProjectPathCandidates → stat() → verified root → allowlisted files

Apply Pack:
  StructuredAnalysis → collectApplyPackItems → applyArtifactPack (merge)

OpenCode (جديد):
  session ref path → load messages/parts → normalizeOpenCodeRecords
    → recordsToTranscript / computeSnapshot
```

---

## 7. ترتيب التنفيذ المقترح

1. **OpenCode transcripts** (OC-A → OC-F) — **جاري**
2. **المرحلة A** (UX gaps)
3. **المرحلة B** (أتمتة)
4. **المرحلة C** (tests + eval)
5. **المرحلة D** (AI advanced)

---

## 8. معايير القبول (Definition of Done)

- [x] OpenCode: list projects/sessions + transcript + snapshot + analysis (fixtures in `server/fixtures/opencode/`)
- [ ] جميع 19 نوع تحليل يعرضون structured cards
- [ ] Governance pipeline كامل مع cancel/resume/autoApply/playbook
- [ ] Dashboard + Wizard + Apply Pack end-to-end
- [ ] 45+ tests passing
- [ ] README محدّث
- [ ] لا regressions على Claude/Pi/Cursor
