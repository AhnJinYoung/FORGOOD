-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('proposed', 'evaluated', 'active', 'proof_submitted', 'verified', 'rejected', 'rewarded');

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "proposer" TEXT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'proposed',
    "rewardAmount" BIGINT,
    "aiDifficulty" INTEGER,
    "aiImpact" INTEGER,
    "aiConfidence" DOUBLE PRECISION,
    "aiRationale" TEXT,
    "metadataUri" TEXT,
    "proofUri" TEXT,
    "proofNote" TEXT,
    "proofSubmittedBy" TEXT,
    "onchainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proof" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "submitter" TEXT NOT NULL,
    "proofUri" TEXT NOT NULL,
    "note" TEXT,
    "verdict" TEXT,
    "confidence" DOUBLE PRECISION,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proof_missionId_idx" ON "Proof"("missionId");

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
