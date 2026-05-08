export interface Claim {
  id: string
  tracking_no: string
  shipment_id: string | null
  customer_id: string | null
  type: 'COD' | 'General'
  claim_amount: number
  paid_amount: number | null
  claim_status: 'claimed' | 'approved' | 'paid'
  ups_claim_no: string | null
  email_sent: boolean
  memo: string | null
  paid_date: string | null
  created_at: string
  updated_at: string
}
