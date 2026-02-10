package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/robfig/cron/v3"
)

const (
	defaultPollInterval    = 10 * time.Second
	cycleTimeout           = 90 * time.Second
	externalRequestTimeout = 20 * time.Second
	maxDeliveryRetries     = 3
	maxLLMRetries          = 2
)

var httpClient = &http.Client{Timeout: externalRequestTimeout}

const lockQuery = `WITH candidate AS (
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
RETURNING jobs.id, jobs.name, jobs.prompt, jobs.allow_web_search,
          jobs.schedule_type, jobs.schedule_time, jobs.schedule_day_of_week,
          jobs.schedule_cron, jobs.channel_type, jobs.channel_config, jobs.fail_count;`

const serviceSystemPrompt = `You are Promptly, an automated scheduled execution agent.

Follow these rules for every response:
1) This is not a chat. Return the final deliverable directly.
2) Be goal-centric and complete the requested task end-to-end in one response.
3) Do not ask follow-up questions unless the prompt explicitly asks you to ask.
4) Do not include conversational fillers, roleplay, or meta commentary.
5) Use clear structure and concise wording.
6) If the request is impossible or unsafe, state the limitation briefly and provide the best valid alternative output.
7) Output plain text only.`

type Job struct {
	ID                string
	Name              string
	Prompt            string
	AllowWebSearch    bool
	ScheduleType      string
	ScheduleTime      string
	ScheduleDayOfWeek sql.NullInt32
	ScheduleCron      sql.NullString
	ChannelType       string
	ChannelConfig     []byte
	FailCount         int
}

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	openAIKey := os.Getenv("OPENAI_API_KEY")
	if databaseURL == "" || openAIKey == "" {
		log.Fatal("DATABASE_URL and OPENAI_API_KEY are required")
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		pingCancel()
		log.Fatalf("ping db: %v", err)
	}
	pingCancel()

	pollInterval := parsePollInterval()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	log.Printf("worker started: poll_interval=%s", pollInterval)

	if err := processOnce(ctx, db, openAIKey); err != nil {
		log.Printf("worker cycle error: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			log.Printf("worker shutdown requested: %v", ctx.Err())
			return
		case <-ticker.C:
		}

		if err := processOnce(ctx, db, openAIKey); err != nil {
			log.Printf("worker cycle error: %v", err)
		}
	}
}

func processOnce(parent context.Context, db *sql.DB, openAIKey string) error {
	ctx, cancel := context.WithTimeout(parent, cycleTimeout)
	defer cancel()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	job, found, err := lockNextJob(ctx, tx)
	if err != nil {
		return err
	}
	if !found {
		return tx.Commit()
	}

	output, runErr := runPrompt(ctx, openAIKey, job.Prompt, job.AllowWebSearch)
	if runErr == nil {
		runErr = deliver(ctx, job, output)
	}

	nextRun, calcErr := computeNextRun(job)
	if calcErr != nil {
		runErr = fmt.Errorf("schedule calc error: %w", calcErr)
		nextRun = time.Now().Add(10 * time.Minute)
	}

	if runErr == nil {
		if err := insertHistory(ctx, tx, job.ID, "success", truncate(output, 1000), ""); err != nil {
			return err
		}
		if err := updateSuccess(ctx, tx, job.ID, nextRun); err != nil {
			return err
		}
	} else {
		if err := insertHistory(ctx, tx, job.ID, "fail", "", truncate(runErr.Error(), 500)); err != nil {
			return err
		}
		if err := updateFailure(ctx, tx, job.ID, nextRun); err != nil {
			return err
		}
		log.Printf("job failed: %s: %v", job.ID, runErr)
	}

	return tx.Commit()
}

func lockNextJob(ctx context.Context, tx *sql.Tx) (Job, bool, error) {
	row := tx.QueryRowContext(ctx, lockQuery)
	var job Job
	err := row.Scan(
		&job.ID,
		&job.Name,
		&job.Prompt,
		&job.AllowWebSearch,
		&job.ScheduleType,
		&job.ScheduleTime,
		&job.ScheduleDayOfWeek,
		&job.ScheduleCron,
		&job.ChannelType,
		&job.ChannelConfig,
		&job.FailCount,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Job{}, false, nil
	}
	if err != nil {
		return Job{}, false, err
	}
	return job, true, nil
}

func runPrompt(ctx context.Context, apiKey, prompt string, allowWebSearch bool) (string, error) {
	type tool struct {
		Type string `json:"type"`
	}
	payload := map[string]any{
		"model":        "gpt-5-mini",
		"instructions": serviceSystemPrompt,
		"input":        prompt,
	}
	if allowWebSearch {
		payload["tools"] = []tool{{Type: "web_search_preview"}}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	var lastErr error
	for attempt := 1; attempt <= maxLLMRetries; attempt++ {
		if err := ctx.Err(); err != nil {
			return "", err
		}

		reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(body))
		if err != nil {
			cancel()
			return "", err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := httpClient.Do(req)
		if err != nil {
			cancel()
			lastErr = err
			if attempt < maxLLMRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return "", sleepErr
				}
				continue
			}
			return "", lastErr
		}

		respBody, readErr := io.ReadAll(resp.Body)
		closeErr := resp.Body.Close()
		cancel()
		if readErr != nil {
			lastErr = readErr
			if attempt < maxLLMRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return "", sleepErr
				}
				continue
			}
			return "", lastErr
		}
		if closeErr != nil {
			lastErr = closeErr
			if attempt < maxLLMRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return "", sleepErr
				}
				continue
			}
			return "", lastErr
		}

		if resp.StatusCode >= 400 {
			lastErr = fmt.Errorf("openai %d: %s", resp.StatusCode, string(respBody))
			if shouldRetryStatus(resp.StatusCode) && attempt < maxLLMRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return "", sleepErr
				}
				continue
			}
			return "", lastErr
		}

		var parsed struct {
			OutputText string `json:"output_text"`
		}
		if err := json.Unmarshal(respBody, &parsed); err != nil {
			return "", err
		}
		if strings.TrimSpace(parsed.OutputText) == "" {
			return "", errors.New("empty llm output")
		}

		return parsed.OutputText, nil
	}

	if lastErr == nil {
		lastErr = errors.New("llm execution failed")
	}
	return "", lastErr
}

func deliver(ctx context.Context, job Job, output string) error {
	head := fmt.Sprintf("[%s] %s", job.Name, time.Now().Format("2006-01-02 15:04"))
	message := head + "\n\n" + output

	if job.ChannelType == "discord" {
		var cfg struct {
			WebhookURL string `json:"webhookUrlEnc"`
		}
		if err := json.Unmarshal(job.ChannelConfig, &cfg); err != nil {
			return err
		}
		webhookURL, err := decryptString(cfg.WebhookURL)
		if err != nil {
			return err
		}
		if strings.TrimSpace(webhookURL) == "" {
			return errors.New("discord webhook url is empty")
		}
		for _, chunk := range chunk(message, 1900) {
			if err := sendJSONWithRetry(ctx, http.MethodPost, webhookURL, map[string]string{"content": chunk}, map[string]string{"Content-Type": "application/json"}, maxDeliveryRetries); err != nil {
				return err
			}
		}
		return nil
	}

	if job.ChannelType == "webhook" {
		var cfg struct {
			ConfigEnc string `json:"configEnc"`
		}
		if err := json.Unmarshal(job.ChannelConfig, &cfg); err != nil {
			return err
		}
		raw, err := decryptString(cfg.ConfigEnc)
		if err != nil {
			return err
		}
		var webhookCfg struct {
			URL     string `json:"url"`
			Method  string `json:"method"`
			Headers string `json:"headers"`
			Payload string `json:"payload"`
		}
		if err := json.Unmarshal([]byte(raw), &webhookCfg); err != nil {
			return err
		}
		if strings.TrimSpace(webhookCfg.URL) == "" {
			return errors.New("webhook url is empty")
		}

		method := strings.ToUpper(strings.TrimSpace(webhookCfg.Method))
		if method == "" {
			method = "POST"
		}

		headers := map[string]string{}
		if strings.TrimSpace(webhookCfg.Headers) != "" {
			if err := json.Unmarshal([]byte(webhookCfg.Headers), &headers); err != nil {
				return fmt.Errorf("invalid webhook headers json: %w", err)
			}
		}
		if _, ok := headers["Content-Type"]; !ok {
			headers["Content-Type"] = "application/json"
		}

		var bodyValue any = map[string]string{"content": message}
		if strings.TrimSpace(webhookCfg.Payload) != "" {
			if err := json.Unmarshal([]byte(webhookCfg.Payload), &bodyValue); err != nil {
				return fmt.Errorf("invalid webhook payload json: %w", err)
			}
		}

		if err := sendJSONWithRetry(ctx, method, webhookCfg.URL, bodyValue, headers, maxDeliveryRetries); err != nil {
			return fmt.Errorf("webhook delivery error: %w", err)
		}
		return nil
	}

	var cfg struct {
		BotToken string `json:"botTokenEnc"`
		ChatID   string `json:"chatIdEnc"`
	}
	if err := json.Unmarshal(job.ChannelConfig, &cfg); err != nil {
		return err
	}
	botToken, err := decryptString(cfg.BotToken)
	if err != nil {
		return err
	}
	chatID, err := decryptString(cfg.ChatID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(botToken) == "" || strings.TrimSpace(chatID) == "" {
		return errors.New("telegram bot token/chat id is empty")
	}
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	for _, chunk := range chunk(message, 4000) {
		if err := sendJSONWithRetry(ctx, http.MethodPost, url, map[string]string{"chat_id": chatID, "text": chunk}, map[string]string{"Content-Type": "application/json"}, maxDeliveryRetries); err != nil {
			return err
		}
	}
	return nil
}

func sendJSONWithRetry(ctx context.Context, method, endpoint string, payload any, headers map[string]string, maxRetries int) error {
	var body []byte
	var err error
	if method != http.MethodGet {
		body, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}

		reqCtx, cancel := context.WithTimeout(ctx, externalRequestTimeout)
		var bodyReader io.Reader
		if body != nil {
			bodyReader = bytes.NewReader(body)
		}

		req, err := http.NewRequestWithContext(reqCtx, method, endpoint, bodyReader)
		if err != nil {
			cancel()
			return err
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			cancel()
			lastErr = err
			if attempt < maxRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return sleepErr
				}
				continue
			}
			return lastErr
		}

		respBody, readErr := io.ReadAll(resp.Body)
		closeErr := resp.Body.Close()
		cancel()
		if readErr != nil {
			lastErr = readErr
			if attempt < maxRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return sleepErr
				}
				continue
			}
			return lastErr
		}
		if closeErr != nil {
			lastErr = closeErr
			if attempt < maxRetries {
				if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
					return sleepErr
				}
				continue
			}
			return lastErr
		}

		if resp.StatusCode < 300 {
			return nil
		}

		lastErr = fmt.Errorf("channel request failed %d: %s", resp.StatusCode, string(respBody))
		if shouldRetryStatus(resp.StatusCode) && attempt < maxRetries {
			if sleepErr := sleepWithContext(ctx, retryBackoff(attempt)); sleepErr != nil {
				return sleepErr
			}
			continue
		}
		return lastErr
	}

	if lastErr == nil {
		lastErr = errors.New("delivery failed")
	}
	return lastErr
}

func shouldRetryStatus(code int) bool {
	return code == http.StatusTooManyRequests || code == http.StatusRequestTimeout || code >= 500
}

func retryBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	base := 400 * time.Millisecond
	multiplier := math.Pow(2, float64(attempt-1))
	backoff := time.Duration(float64(base) * multiplier)
	if backoff > 4*time.Second {
		return 4 * time.Second
	}
	return backoff
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func insertHistory(ctx context.Context, tx *sql.Tx, jobID, status, outputPreview, errorMessage string) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO run_histories (id, job_id, run_at, status, output_preview, error_message)
		 VALUES ($1, $2, now(), $3, $4, $5)`,
		uuid.NewString(), jobID, status, nullIfEmpty(outputPreview), nullIfEmpty(errorMessage),
	)
	return err
}

func updateSuccess(ctx context.Context, tx *sql.Tx, jobID string, nextRun time.Time) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE jobs
		 SET fail_count = 0, locked_at = NULL, next_run_at = $2, updated_at = now()
		 WHERE id = $1`,
		jobID, nextRun,
	)
	return err
}

func updateFailure(ctx context.Context, tx *sql.Tx, jobID string, nextRun time.Time) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE jobs
		 SET fail_count = fail_count + 1,
		     locked_at = NULL,
		     next_run_at = $2,
		     enabled = CASE WHEN fail_count + 1 >= 10 THEN false ELSE enabled END,
		     updated_at = now()
		 WHERE id = $1`,
		jobID, nextRun,
	)
	return err
}

func computeNextRun(job Job) (time.Time, error) {
	now := time.Now()
	switch job.ScheduleType {
	case "daily":
		h, m, err := parseHHMM(job.ScheduleTime)
		if err != nil {
			return time.Time{}, err
		}
		next := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, now.Location())
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		return next, nil
	case "weekly":
		h, m, err := parseHHMM(job.ScheduleTime)
		if err != nil {
			return time.Time{}, err
		}
		if !job.ScheduleDayOfWeek.Valid {
			return time.Time{}, errors.New("missing weekly day_of_week")
		}
		target := int(job.ScheduleDayOfWeek.Int32)
		delta := (target - int(now.Weekday()) + 7) % 7
		next := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, now.Location()).AddDate(0, 0, delta)
		if !next.After(now) {
			next = next.AddDate(0, 0, 7)
		}
		return next, nil
	case "cron":
		if !job.ScheduleCron.Valid {
			return time.Time{}, errors.New("missing cron expression")
		}
		sched, err := cron.ParseStandard(job.ScheduleCron.String)
		if err != nil {
			return time.Time{}, err
		}
		return sched.Next(now), nil
	default:
		return time.Time{}, fmt.Errorf("unknown schedule type %s", job.ScheduleType)
	}
}

func parseHHMM(raw string) (int, int, error) {
	parts := strings.Split(raw, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid time %s", raw)
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, err
	}
	minute, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, err
	}
	if hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return 0, 0, fmt.Errorf("invalid time %s", raw)
	}
	return hour, minute, nil
}

func parsePollInterval() time.Duration {
	raw := strings.TrimSpace(os.Getenv("WORKER_POLL_INTERVAL"))
	if raw == "" {
		return defaultPollInterval
	}
	parsed, err := time.ParseDuration(raw)
	if err != nil || parsed <= 0 {
		log.Printf("invalid WORKER_POLL_INTERVAL=%q, using default=%s", raw, defaultPollInterval)
		return defaultPollInterval
	}
	if parsed < time.Second {
		log.Printf("WORKER_POLL_INTERVAL too low (%s), clamping to 1s", parsed)
		return time.Second
	}
	return parsed
}

func decryptString(value string) (string, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 3 {
		return "", errors.New("invalid encrypted payload")
	}
	iv, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	tag, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return "", err
	}

	key := deriveKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	full := append(ciphertext, tag...)
	plaintext, err := gcm.Open(nil, iv, full, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func deriveKey() []byte {
	raw := os.Getenv("CHANNEL_SECRET_KEY")
	if raw == "" {
		raw = os.Getenv("NEXTAUTH_SECRET")
	}
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func chunk(value string, size int) []string {
	runes := []rune(value)
	if len(runes) <= size {
		return []string{value}
	}
	out := []string{}
	for len(runes) > size {
		out = append(out, string(runes[:size]))
		runes = runes[size:]
	}
	if len(runes) > 0 {
		out = append(out, string(runes))
	}
	return out
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}
