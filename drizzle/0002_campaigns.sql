CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"difficulty" text DEFAULT 'standard' NOT NULL,
	"taboo" boolean DEFAULT false NOT NULL,
	"owner_id" text NOT NULL,
	"next_scenario" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_change" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb NOT NULL,
	"revert_of" text,
	"reverted_by" text,
	"chat_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_invite" (
	"token" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "campaign_member" (
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp NOT NULL,
	CONSTRAINT "campaign_member_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "deck_version" (
	"id" text PRIMARY KEY NOT NULL,
	"seat_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"list" jsonb NOT NULL,
	"campaign_cards" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"change_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invited_email" (
	"email" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "invited_email_email_token_pk" PRIMARY KEY("email","token")
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"investigator_code" text,
	"status" text DEFAULT 'active' NOT NULL,
	"deck_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"seat_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"change_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_change" ADD CONSTRAINT "campaign_change_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_change" ADD CONSTRAINT "campaign_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invite" ADD CONSTRAINT "campaign_invite_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invite" ADD CONSTRAINT "campaign_invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_member" ADD CONSTRAINT "campaign_member_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_member" ADD CONSTRAINT "campaign_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_version" ADD CONSTRAINT "deck_version_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invited_email" ADD CONSTRAINT "invited_email_token_campaign_invite_token_fk" FOREIGN KEY ("token") REFERENCES "public"."campaign_invite"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_entry" ADD CONSTRAINT "seat_entry_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_change_campaign_idx" ON "campaign_change" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_member_user_idx" ON "campaign_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deck_version_seat_idx" ON "deck_version" USING btree ("seat_id");--> statement-breakpoint
CREATE INDEX "seat_campaign_idx" ON "seat" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "seat_entry_seat_idx" ON "seat_entry" USING btree ("seat_id");