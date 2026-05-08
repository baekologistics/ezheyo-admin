export type SettlePayMethod = 'Zelle' | 'Check' | 'Wire' | 'ACH' | 'Cash'

export interface Settlement {
  id: string
  month: string
  revenue: number
  ups_cost: number
  net_profit: number
  baeko_amount: number
  sales_amount: number
  overhead_amount: number
  baeko_paid: boolean
  baeko_paid_date: string | null
  baeko_paid_method: string | null
  baeko_memo: string | null
  created_at: string
  updated_at: string
}

export interface SettlementPayment {
  id: string
  settlement_id: string
  recipient_type: 'baeko' | 'sales_person'
  sales_person: string | null
  amount: number
  method: SettlePayMethod
  paid_date: string
  memo: string | null
  created_at: string
}
