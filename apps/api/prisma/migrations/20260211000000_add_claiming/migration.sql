-- AlterTable: add claiming fields to Mission
ALTER TABLE "Mission" ADD COLUMN "claimedBy" TEXT;
ALTER TABLE "Mission" ADD COLUMN "claimedAt" TIMESTAMP(3);
