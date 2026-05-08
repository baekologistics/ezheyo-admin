export type ParsedStatus = 'pending' | 'parsed' | 'failed'

export interface CodStatement {
  id: string
  statement_no: string
  statement_date: string
  source: 'auto' | 'manual'
  uploaded_at: string
  parsed_status: ParsedStatus
  deposit_total: number
  file_path: string | null
  created_at: string
}
