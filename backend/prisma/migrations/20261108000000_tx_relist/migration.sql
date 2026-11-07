-- 자동 취소된 상품을 다시 팔 수 있도록 상품당 거래 1건 제한을 해제
DROP INDEX "Transaction_listingId_key";

CREATE INDEX "Transaction_listingId_idx" ON "Transaction"("listingId");
