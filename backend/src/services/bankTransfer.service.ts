// 한국 은행 코드표 (금융결제원 기준)
export const BANK_CODES: Record<string, string> = {
  'KDB산업은행': '002', 'IBK기업은행': '003', 'KB국민은행': '004',
  '수협은행': '007',    'NH농협은행': '011', '농협은행': '011',
  '우리은행': '020',    'SC제일은행': '023', '한국씨티은행': '027',
  '씨티은행': '027',    '부산은행': '032',   '광주은행': '034',
  '제주은행': '035',    '전북은행': '037',   '경남은행': '039',
  '새마을금고': '045',  '신협': '048',       '우체국': '071',
  '하나은행': '081',    '신한은행': '088',   'K뱅크': '089',
  '케이뱅크': '089',   '카카오뱅크': '090', '토스뱅크': '092',
}

export interface TransferParams {
  bankName: string
  accountNumber: string
  accountHolder: string
  amount: number
  memo?: string
}

export interface TransferResult {
  success: boolean
  transferId?: string
  errorMessage?: string
  rawStatus?: string
}

interface TossPayoutResponse {
  payoutId?: string
  transferId?: string
  status?: string
  message?: string
  code?: string
}

export async function executeBankTransfer(params: TransferParams): Promise<TransferResult> {
  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey) {
    return { success: false, errorMessage: 'TOSS_SECRET_KEY가 설정되지 않았습니다.' }
  }

  const bankCode = BANK_CODES[params.bankName]
  if (!bankCode) {
    return { success: false, errorMessage: `지원하지 않는 은행입니다: ${params.bankName}` }
  }

  const encoded = Buffer.from(`${secretKey}:`).toString('base64')
  const memo = params.memo ?? '로켓옥션하우스 포인트 환전'

  try {
    const res = await fetch('https://api.tosspayments.com/v1/payouts', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bank: bankCode,
        accountNumber: params.accountNumber,
        holderName: params.accountHolder,
        amount: params.amount,
        purpose: 'ETC',
        memo,
      }),
    })

    const body = await res.json() as TossPayoutResponse

    if (res.ok) {
      return {
        success: true,
        transferId: body.payoutId ?? body.transferId,
        rawStatus: body.status,
      }
    }

    // Toss 오류 응답
    return {
      success: false,
      errorMessage: body.message ?? `이체 API 오류 (${res.status})`,
      rawStatus: body.code,
    }
  } catch (err) {
    return {
      success: false,
      errorMessage: `네트워크 오류: ${String(err)}`,
    }
  }
}
