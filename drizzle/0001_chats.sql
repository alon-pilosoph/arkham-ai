CREATE TABLE "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"chat_id" text NOT NULL,
	"id" text NOT NULL,
	"parent_id" text,
	"format" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "chat_message_chat_id_id_pk" PRIMARY KEY("chat_id","id")
);
--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_user_id_idx" ON "chat" USING btree ("user_id","updated_at");