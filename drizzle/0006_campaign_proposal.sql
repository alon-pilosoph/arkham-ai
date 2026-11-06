ALTER TABLE "campaign" ADD COLUMN "proposal_id" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_proposal_id_unique" UNIQUE("proposal_id");