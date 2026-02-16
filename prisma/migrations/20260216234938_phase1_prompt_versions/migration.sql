-- AlterTable
ALTER TABLE "public"."jobs" ADD COLUMN     "published_prompt_version_id" UUID;

-- AlterTable
ALTER TABLE "public"."run_histories" ADD COLUMN     "prompt_version_id" UUID;

-- CreateTable
CREATE TABLE "public"."prompt_versions" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_prompt_versions_job_id" ON "public"."prompt_versions"("job_id");

-- CreateIndex
CREATE INDEX "idx_jobs_published_prompt_version_id" ON "public"."jobs"("published_prompt_version_id");

-- CreateIndex
CREATE INDEX "idx_run_histories_prompt_version_id" ON "public"."run_histories"("prompt_version_id");

-- AddForeignKey
ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_published_prompt_version_id_fkey" FOREIGN KEY ("published_prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."prompt_versions" ADD CONSTRAINT "prompt_versions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."run_histories" ADD CONSTRAINT "run_histories_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
