-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('PENDING', 'ADDED', 'DECLINED');

-- AlterTable
ALTER TABLE "DashboardShare" ADD COLUMN "status" "ShareStatus" NOT NULL DEFAULT 'PENDING';
