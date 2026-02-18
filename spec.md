# Prompt Scheduler MVP Spec

> 목적: 개인 사용자가 프롬프트를 등록하면 정해진 스케줄에 따라
> gpt-5-mini로 실행하고 결과를 Discord 또는 Telegram으로 자동 전송하는
> 서비스. 본 문서는 **LLM 에이전트가 구현**할 수 있도록 요구사항,
> 아키텍처, 데이터 모델, API, UI, 워커 설계까지 **실행 가능한 수준**으로
> 정의한다.

------------------------------------------------------------------------

## 1. 제품 범위

### 1.1 포함 (MVP)

-   소셜 로그인만 지원: Google, GitHub, Discord
-   Job(프롬프트 작업) CRUD
-   스케줄링: daily / weekly / cron
-   단일 모델: **gpt-5-mini**
-   (기본) 모델: `openai/gpt-5-mini` (AI Gateway model id)
-   옵션: **웹 검색 토글(allow_web_search)**
    -   웹 검색은 유저가 원할 때만 켠다(기본 OFF)
    -   (확장) Vercel AI Gateway Web Search 옵션으로 동작
-   **미리 실행(Preview)**: 저장 전 즉시 1회 실행 + 화면 미리보기 (+
    선택적으로 테스트 전송)
-   전송 채널: Discord(Webhook), Telegram(Bot Token + Chat ID)
-   실행 히스토리 저장
-   **Vercel Cron Jobs + Vercel Functions**로 정기 실행 처리 (`/api/cron/run-jobs`)
-   배포: Next.js(풀스택) on Vercel, PostgreSQL, Vercel Analytics,
    Vercel AI SDK (AI Gateway)

### 1.2 제외

-   팀/공유
-   과금/결제
-   체인 프롬프트/에이전트
-   외부 데이터 소스 연동(웹 검색은 AI Gateway Web Search tool 범위 내)
-   고급 리포트/분석

------------------------------------------------------------------------

## 2. 기술 스택

-   Front/Back: Next.js(App Router) 풀스택
-   Hosting: Vercel
-   DB: PostgreSQL
-   ORM: Prisma
-   Auth: OAuth 소셜 로그인 (Google, GitHub, Discord)
-   AI: Vercel AI SDK (AI Gateway)
-   Worker: Vercel Functions + Vercel Cron Jobs
-   채널:
    -   Discord: Webhook
    -   Telegram: Bot API
-   Analytics: Vercel Analytics

------------------------------------------------------------------------

## 3. 아키텍처 개요

-   Web(App):
    -   UI, Job 관리 API, Preview 실행 API, Auth
-   Worker(Vercel Functions + Cron):
    -   DB 폴링 + 락 획득
    -   스케줄 도달 Job 실행
    -   LLM 호출(웹 검색 옵션 반영)
    -   Discord/Telegram 전송
    -   RunHistory 저장
    -   next_run_at 갱신 / 실패 재시도

------------------------------------------------------------------------

## 4. 데이터 모델 (PostgreSQL)

### 4.1 users

-   id UUID PK
-   provider TEXT (google\|github\|discord\|telegram)
-   provider_user_id TEXT
-   email TEXT NULL
-   name TEXT NULL
-   avatar_url TEXT NULL
-   created_at TIMESTAMPTZ

Unique: (provider, provider_user_id)

### 4.2 jobs

``` sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,

  name TEXT NOT NULL,
  prompt TEXT NOT NULL,                   -- 템플릿 문자열(하위 호환)
  published_prompt_version_id UUID NULL,  -- 현재 발행된 PromptVersion

  allow_web_search BOOLEAN NOT NULL DEFAULT FALSE,

  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily','weekly','cron')),
  schedule_time TEXT NOT NULL,      -- "HH:mm"
  schedule_day_of_week INT NULL,     -- 0~6, weekly
  schedule_cron TEXT NULL,           -- cron string

  channel_type TEXT NOT NULL CHECK (channel_type IN ('discord','telegram','webhook')),
  channel_config JSONB NOT NULL,     -- discord/telegram/webhook 설정

  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  next_run_at TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ NULL,
  fail_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_next_run_at ON jobs (next_run_at);
CREATE INDEX idx_jobs_enabled ON jobs (enabled);
```

### 4.3 run_histories

``` sql
CREATE TABLE run_histories (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(id),
  prompt_version_id UUID NULL REFERENCES prompt_versions(id),
  scheduled_for TIMESTAMPTZ NULL,          -- 크론/스케줄 인스턴스(멱등 키)
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('running','success','fail')),
  output_text TEXT NULL,                   -- 재전송/재시도에 사용
  output_preview TEXT NULL,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  runner_id TEXT NULL,                     -- 크론 호출 상관관계 id

  delivered_at TIMESTAMPTZ NULL,
  delivery_attempts INT NOT NULL DEFAULT 0,
  delivery_last_error TEXT NULL,

  llm_model TEXT NULL,
  llm_usage JSONB NULL,
  llm_tool_calls JSONB NULL,
  used_web_search BOOLEAN NOT NULL DEFAULT FALSE,
  citations JSONB NULL,

  error_message TEXT NULL
);

CREATE INDEX idx_run_histories_job_id ON run_histories (job_id);
```

### 4.4 audit_logs (거버넌스)

- 목적: 사용자의 주요 변경 이력(잡 생성/수정/삭제, 프롬프트 발행 등)을 감사 로그로 남김

### 4.5 eval_suites / eval_cases / eval_runs (프롬프트 평가)

- 목적: PromptVersion 별로 간단한 회귀 테스트를 수행하고 결과를 저장
- EvalCase는 variables(템플릿 변수)와 mustInclude(출력 포함 필수 문자열 목록)으로 구성

------------------------------------------------------------------------

## 5. 워커 설계 (Vercel Functions + Cron)

### 5.1 책임

-   실행 시점 도달 Job 조회
-   **FOR UPDATE SKIP LOCKED**로 락 획득
-   스케줄 인스턴스 기준 멱등 처리(중복 트리거가 와도 1회만 전송)
-   LLM 호출 (gpt-5-mini, allow_web_search 반영)
-   채널 전송
-   RunHistory 저장
-   성공/실패에 따라 next_run_at 갱신, fail_count 처리
-   10회 연속 실패 시 enabled=false

### 5.2 Fetch & Lock SQL

``` sql
WITH candidate AS (
  SELECT id
  FROM jobs
  WHERE enabled = true
    AND next_run_at <= now()
    AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
  ORDER BY next_run_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs
SET locked_at = now()
FROM candidate
WHERE jobs.id = candidate.id
RETURNING jobs.*;
```

### 5.3 성공/실패 업데이트

성공:

``` sql
UPDATE jobs
SET fail_count = 0,
    locked_at = NULL,
    next_run_at = $2,
    updated_at = now()
WHERE id = $1;
```

실패:

``` sql
UPDATE jobs
SET fail_count = fail_count + 1,
    locked_at = NULL,
    next_run_at = $2,
    enabled = CASE WHEN fail_count + 1 >= 10 THEN false ELSE enabled END,
    updated_at = now()
WHERE id = $1;
```

RunHistory:

``` sql
INSERT INTO run_histories (id, job_id, run_at, status, output_preview, error_message)
VALUES ($1, $2, now(), $3, $4, $5);
```

### 5.4 스케줄 계산

-   daily: 오늘/내일 기준 HH:mm
-   weekly: 요일 + 시간
-   cron: 라이브러리 사용 (robfig/cron 등)

### 5.5 폴링 루프

-   10초 간격
-   1회에 1 Job 처리(단순성 우선)
-   워커 여러 개 띄워도 안전

------------------------------------------------------------------------

## 6. LLM 호출 정책

-   모델: Job 단위로 `llm_model` 선택 (기본: `openai/gpt-5-mini`)
-   allow_web_search=false:
    -   일반 생성 호출
-   allow_web_search=true:
    -   AI Gateway Web Search tool 포함 호출 (유저가 켠 경우에만)
-   타임아웃 필수(예: 60초)
-   출력은 텍스트만 사용
-   웹 검색 사용 시:
    -   Responses API annotations(`url_citation`) 기반으로 citations를 추출/저장
    -   tool 호출 정보(web_search_call)와 usage를 저장

------------------------------------------------------------------------

## 7. 전송 정책

-   Discord: Webhook POST `{ content: "..." }`
-   Telegram: `sendMessage`
-   Webhook: 기본 payload는 안정적인 JSON 형태로 전송
    -   `{ title, body, content, usedWebSearch, citations, meta }`
-   메시지 길이 초과 시 분할 전송
-   메시지 헤더: `[Job 이름] YYYY-MM-DD HH:mm`

------------------------------------------------------------------------

## 8. Web(App) API

-   POST /api/jobs
-   PUT /api/jobs/{id}
-   DELETE /api/jobs/{id}
-   GET /api/jobs
-   POST /api/jobs/{id}/preview (미리 실행)
-   POST /api/preview (임시 Job 데이터로 미리 실행)

Auth: - OAuth 로그인 (Google, GitHub, Discord) - 자체 비밀번호
없음 - 로그인 후 세션 발급

------------------------------------------------------------------------

## 9. Job 생성 UI (핵심 화면)

### 9.1 섹션

1)  Job 이름
2)  Prompt 입력 (+ 예시 버튼)
3)  옵션: 웹 검색 토글
4)  미리 실행:
    -   \[미리 실행\] 버튼
    -   결과 미리보기 패널
    -   (선택) 테스트 전송 체크
5)  스케줄:
    -   daily / weekly / cron
6)  채널:
    -   Discord(Webhook)
    -   Telegram(Bot Token, Chat ID)
7)  저장

### 9.2 UX 원칙

-   "프롬프트 → 미리 실행 → 결과 확인 → 저장"
-   저장 전 반드시 미리 실행 가능
-   실패 시 즉시 에러 메시지 표시

------------------------------------------------------------------------

## 10. 컴포넌트 트리 (요약)

-   JobEditorPage (Client)
    -   JobHeaderSection
    -   JobPromptSection
    -   JobOptionsSection (WebSearchToggle)
    -   JobPreviewSection
    -   JobScheduleSection
    -   JobChannelSection
    -   JobActionsSection

상태는 JobFormProvider(Context)로 관리.

------------------------------------------------------------------------

## 11. JobFormState (TypeScript 요약)

-   name: string
-   prompt: string
-   useWebSearch: boolean
-   scheduleType: 'daily'\|'weekly'\|'cron'
-   time: string
-   dayOfWeek?: number
-   cron?: string
-   channel: { type:'discord', config:{webhookUrl} } \| {
    type:'telegram', config:{botToken, chatId} }
-   enabled: boolean
-   preview: { loading, status, output?, errorMessage?, executedAt?,
    usedWebSearch? }

------------------------------------------------------------------------

## 12. 보안

-   OAuth 토큰은 로그인 시에만 사용
-   Discord Webhook / Telegram Bot Token:
    -   DB에 암호화 저장
    -   UI에서는 마스킹
    -   로그 출력 금지
-   세션: HTTP-only, Secure 쿠키
-   워커 환경변수:
    -   PRISMA_DATABASE_URL, AI_GATEWAY_API_KEY, CRON_SECRET

------------------------------------------------------------------------

## 18. Vercel AI Gateway 멀티 모델 + Web Search 계획

> 목표: "강제" 없이 유저가 모델/웹검색을 선택하면 그때만 활성화. 기본값은 항상 보수적으로(웹검색 OFF).

### 18.1 요구사항

-   유저가 Job 단위로 다음을 선택 가능해야 한다.
    -   `llmModel`: 실행 모델 (예: `openai/gpt-5-mini`, `anthropic/...`, `google/...`)
-   `useWebSearch`: 웹 검색 ON/OFF (기본 OFF)
    -   `webSearchMode`: `native` (provider-native web search만 사용; `llmModel` prefix로 provider를 결정)

### 18.2 데이터 모델 변경

-   `jobs`에 컬럼 추가: 완료
    -   `llm_model TEXT NULL` (Gateway 모델 식별자)
    -   `web_search_mode TEXT NULL` (현재는 `native`만 사용)

### 18.3 API/실행 경로 변경

-   Preview 및 워커 실행 모두 동일한 선택 규칙을 사용한다.
-   `useWebSearch=false`:
        -   어떤 검색 tool도 붙이지 않는다.
-   `useWebSearch=true`:
        -   `llmModel` prefix에 따라 provider-native web search tool을 1개만 붙인다.
            -   `openai/*` -> OpenAI web search tool
            -   `anthropic/*` -> Anthropic web search tool
            -   `google/*` -> Google web search tool

### 18.4 Fallback/라우팅 규칙

-   "웹 검색 ON"인 경우, 검색 기능이 깨지는 provider로 fallback하지 않는다.
    -   웹 검색은 provider-native tool에 의존하므로, 가능하면 동일 provider로만 실행되도록 라우팅 제한을 검토한다.

### 18.5 UX

-   JobOptionsSection에 다음 UI를 제공
    -   Model select (`llmModel`)
-   Web search checkbox (`useWebSearch`)
    -   Web search mode select는 제공하지 않는다 (`native` 고정)

### 18.6 환경변수(계획)

-   `AI_GATEWAY_API_KEY`: Vercel AI Gateway 인증키
-   provider-specific 검색 도구를 사용할 경우 provider별 키/BYOK 정책은 Gateway 문서에 따름
-   구현은 provider-native web search tool 정의를 위해 AI SDK provider packages를 사용한다 (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`).

------------------------------------------------------------------------

## 13. 한계 및 정책

-   유저별 하루 실행 횟수 제한(남용 방지)
-   미리 실행도 카운트 포함
-   프롬프트 길이 제한
-   실패 10회 연속 시 자동 비활성화
-   오래된 락(10분 이상)은 자동 회수

------------------------------------------------------------------------

## 14. UI 테마

-   Tailwind 기반
-   Black & White, Notion-like Minimal
-   배경: white
-   텍스트: zinc-900 / 보조 zinc-500
-   보더: zinc-200
-   Primary 버튼: black bg, white text
-   그림자 최소, 보더 위주

------------------------------------------------------------------------

## 15. 완료 기준(MVP)

-   소셜 로그인 2종 이상 동작
-   Job 생성/수정/삭제 가능
-   미리 실행 동작
-   Vercel 워커(Functions + Cron)가 스케줄 실행
-   Discord/Telegram 전송 성공
-   RunHistory 저장/조회 가능
-   Vercel 배포 완료

------------------------------------------------------------------------

## 16. 구현 순서(권장)

1)  Auth + 기본 레이아웃
2)  Job CRUD + DB 스키마
3)  Job Editor UI + Preview
4)  Vercel 워커(Functions + Cron) + 스케줄 실행
5)  채널 전송
6)  제한/에러 처리/관측 보강

------------------------------------------------------------------------

## 17. 구현 현황 반영 (2026-02-08)

### 17.1 완료된 항목

-   Auth + 기본 레이아웃: 완료
-   Job CRUD + DB 스키마: 완료
-   Job Editor UI + Preview: 완료
    -   weekly 요일 셀렉트 표시
    -   cron 표현식 자연어 설명 표시
    -   Preview 테스트 전송(채널) 토글 반영
-   Vercel 워커(Functions + Cron) + 스케줄 실행: 완료
-   채널 전송(Discord/Telegram): 완료
-   제한/에러 처리 보강: 완료
    -   일일 실행 제한(Preview 포함)
    -   10회 연속 실패 시 자동 비활성화
    -   오래된 락 회수(10분)

### 17.2 동작 정책 반영

-   LLM 호출에 서비스 시스템 프롬프트 적용:
    -   비대화형(non-chat) 결과 지향 출력
    -   목표 중심의 완결된 응답 우선

### 17.3 현재 스펙 대비 차이점(의도된 변경)

-   소셜 로그인에서 Telegram 로그인은 제거됨(요청 반영).
-   Telegram은 전송 채널로만 유지됨.
-   배포 경로는 Vercel 외에 Docker Compose 로컬/VM 경로도 추가됨.
-   **UI/UX 개선 (2026-02-10)**:
    -   Notion-like Minimal 스타일 강화 (그림자 제거, 라인 위주).
    -   Navbar: 텍스트 링크 기반 인증(Sign in/out), 중복 버튼 제거.
    -   Sign Out: 별도 `/signout` 라우트를 통해 안정적인 로그아웃 처리.
    -   Dashboard: 헤더에 'Create Job' 버튼 추가.
    -   Job Editor: 'Back' 링크 제거, 'Use example'/'Clear' 편의 버튼 추가.
    -   Landing/Help CTA를 `text-sm`/`text-xs` 중심의 작고 깔끔한 버튼으로 통일.
    -   (2026-02-11) Edit Job 페이지 상단 Back 링크 제거로 Job Editor 진입 흐름 단순화.
    -   (2026-02-11) UI 문구/버튼 텍스트를 `src/content/ui-text.ts`로 중앙화하여 유지보수성 개선.
    -   (2026-02-11) Link/Button 표준화 완료:
        -   네비게이션 CTA는 `LinkButton`, 액션은 `Button`으로 의미 기반 분리.
        -   `src/components/ui/control-styles.ts`로 크기/타이포/패딩 토큰 통합.
        -   `scripts/check-ui-controls.sh` + `npm run check:ui-controls`로 드리프트 방지.
