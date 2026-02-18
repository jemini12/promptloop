-- CreateTable
CREATE TABLE "public"."chats" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" UUID NOT NULL,
    "chat_id" VARCHAR(64) NOT NULL,
    "message_id" VARCHAR(128) NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "message" JSONB NOT NULL,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chats_user_id_updated_at" ON "public"."chats"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "idx_chat_messages_chat_id_created_at" ON "public"."chat_messages"("chat_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_chat_messages_chat_id_message_id" ON "public"."chat_messages"("chat_id", "message_id");

-- AddForeignKey
ALTER TABLE "public"."chats" ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
