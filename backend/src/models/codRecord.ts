export type QuickbookStatus = 'none' | 'bill_created' | 'paid'

export interface CodRecord {
  id: string
  cod_statement_id: string
  shipment_id: string | null
  reference_no: string
  tracking_no: string
  pickup_date: string
  delivery_date: string | null
  cod_amount: number
  check_no: string | null
  service_fee: number
  premium_fee: number
  check_amount: number
  customer_id: string | null
  returned: boolean
  claimed_payment: boolean
  email_sent: boolean
  quickbook_status: QuickbookStatus
  quickbook_bill_no: string | null
  paid: boolean
  created_at: string
  updated_at: string
}
