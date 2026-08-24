-- CreateTable
CREATE TABLE "FxSchedulerLock" (
    "key" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "FxSchedulerLock_pkey" PRIMARY KEY ("key")
);
