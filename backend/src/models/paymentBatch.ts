export type PayMethod = 'QB Bill' | 'Zelle' | 'Cash' | 'Check' | 'ACH'

export interface PaymentBatch {
  id: string
  batch_date: string
  customer_id: string
  total_amount: number
  method: PayMethod
  quickbook_bill_no: string | null
  status: 'pending' | 'paid'
  paid_date: string | null
  memo: string | null
  created_at: string
}

export interface PaymentBatchRecord {
  id: string
  payment_batch_id: string
  cod_record_id: string
}
