-- 발송 기한은 배송지가 확정된 시점부터 계산 (경매 낙찰은 배송지 입력 후 시작)
ALTER TABLE "Transaction" ADD COLUMN "shipClockAt" TIMESTAMP(3);

-- 기존 거래: 배송지가 있으면 결제 시각부터 계산하던 기존 규칙 유지
UPDATE "Transaction" SET "shipClockAt" = "completedAt" WHERE "address" IS NOT NULL;

CREATE INDEX "Transaction_txStatus_shipClockAt_idx" ON "Transaction"("txStatus", "shipClockAt");
