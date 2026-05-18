'use client'
import { useState, useEffect } from 'react'
import styles from './requests.module.css'
import { authFetch } from '@/lib/auth'

export type RequestItem = {
  id:            string
  request_no:    number
  status:        string
  title:         string | null
  description:   string | null
  memo:          string | null
  admin_memo:    string | null
  payment_type:  string | null
  amount:        string | number | null
  tracking_no:   string | null
  order_id:      string | null
  extra_data:    Record<string, unknown> | null
  processed_by:  string | null
  processed_at:  string | null
  shipheyo_synced:    boolean
  shipheyo_synced_at: string | null
  email_sent:    boolean
  email_sent_at: string | null
  created_at:    string
  type_code:     string
  type_label:    string
  type_icon:     string
  customer_name:  string | null
  customer_email: string | null
  customer_id:    string | null
}

type Props = {
  request:  RequestItem
  onClose:  () => void
  onUpdate: (updated: RequestItem) => void
}

const STATUS_ORDER = ['pending', 'approved', 'rejected', 'completed']

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function badgeClass(s: string, st: typeof styles) {
  switch (s) {
    case 'pending':   return st.badgePending
    case 'approved':  return st.badgeApproved
    case 'rejected':  return st.badgeRejected
    case 'completed': return st.badgeCompleted
    default:          return st.badgePending
  }
}

export default function RequestDetailModal({ request, onClose, onUpdate }: Props) {
  const [adminMemo, setAdminMemo]   = useState(request.admin_memo ?? '')
  const [saving,    setSaving]      = useState(false)
  const [saveMsg,   setSaveMsg]     = useState('')
  const [current,   setCurrent]     = useState<RequestItem>(request)

  useEffect(() => {
    setCurrent(request)
    setAdminMemo(request.admin_memo ?? '')
  }, [request])

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await authFetch(`/api/requests/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated = await res.json() as RequestItem
      // Re-fetch full record with joins
      const full = await authFetch(`/api/requests/${current.id}`)
      const fullData = full.ok ? (await full.json()) as RequestItem : { ...current, ...updated }
      setCurrent(fullData)
      onUpdate(fullData)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (e) {
      setSaveMsg(`Error: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const saveAdminMemo = () => patch({ admin_memo: adminMemo })
  const setStatus     = (status: string) => patch({ status, admin_memo: adminMemo, processed_by: 'Admin' })
  const sendEmail     = () => patch({ email_sent: true })

  const canApprove  = current.status === 'pending'
  const canReject   = current.status === 'pending' || current.status === 'approved'
  const canComplete = current.status === 'approved'

  const fmt = (n: number | string | null | undefined) =>
    n != null && n !== '' ? `$${Number(n).toFixed(2)}` : '—'

  const fmtDate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  // ── Render type-specific content ──────────────────────────
  function renderRequestContent() {
    switch (current.type_code) {
      case 'payment':
        return (
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Payment Type</span>
              <span className={styles.fieldVal}>
                {current.payment_type
                  ? current.payment_type.charAt(0).toUpperCase() + current.payment_type.slice(1)
                  : '—'}
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Amount</span>
              <span className={styles.fieldVal} style={{ fontSize: 16, fontWeight: 700 }}>
                {fmt(current.amount)}
              </span>
            </div>
            {current.memo && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Customer Memo</span>
                <div className={styles.memoBox}>{current.memo}</div>
              </div>
            )}
          </div>
        )
      case 'void':
        return (
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Tracking No</span>
              <span className={styles.fieldVal} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {current.tracking_no ?? '—'}
              </span>
            </div>
            {current.order_id && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Order ID</span>
                <span className={styles.fieldVal}>{current.order_id}</span>
              </div>
            )}
            {current.memo && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Customer Memo</span>
                <div className={styles.memoBox}>{current.memo}</div>
              </div>
            )}
            {current.extra_data && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Details</span>
                <div className={styles.extraBox}>{JSON.stringify(current.extra_data, null, 2)}</div>
              </div>
            )}
          </div>
        )
      case 'supply_order':
        return (
          <div className={styles.fieldGrid}>
            {current.memo && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Customer Memo</span>
                <div className={styles.memoBox}>{current.memo}</div>
              </div>
            )}
            {current.extra_data && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Order Details</span>
                <div className={styles.extraBox}>{JSON.stringify(current.extra_data, null, 2)}</div>
              </div>
            )}
          </div>
        )
      default:
        return (
          <div className={styles.fieldGrid}>
            {current.description && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Description</span>
                <div className={styles.memoBox}>{current.description}</div>
              </div>
            )}
            {current.memo && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Customer Memo</span>
                <div className={styles.memoBox}>{current.memo}</div>
              </div>
            )}
            {current.extra_data && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Extra Data</span>
                <div className={styles.extraBox}>{JSON.stringify(current.extra_data, null, 2)}</div>
              </div>
            )}
          </div>
        )
    }
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>

        {/* ── Header ─────────────────────────────────────── */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span className={styles.modalReqNo}>
              #{String(current.request_no).padStart(4, '0')} &nbsp;·&nbsp; {fmtDate(current.created_at)}
            </span>
            <div className={styles.modalTypeRow}>
              <span className={styles.modalTypeIcon}>{current.type_icon}</span>
              <span className={styles.modalTypeName}>{current.type_label}</span>
              <span className={`${styles.badge} ${badgeClass(current.status, styles)}`}>
                {statusLabel(current.status)}
              </span>
            </div>
          </div>
          <button className={styles.modalClose} onClick={onClose} title="Close">✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* ── Customer ───────────────────────────────────── */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Customer</div>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <span className={styles.fieldVal}>{current.customer_name ?? '—'}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Email</span>
                <span className={styles.fieldVal} style={{ fontSize: 12 }}>
                  {current.customer_email ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Request content ────────────────────────────── */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Request Details</div>
            {current.title && (
              <div className={styles.field} style={{ marginBottom: 6 }}>
                <span className={styles.fieldLabel}>Title</span>
                <span className={styles.fieldVal}>{current.title}</span>
              </div>
            )}
            {renderRequestContent()}
          </div>

          {/* ── Processing info ────────────────────────────── */}
          {(current.processed_by || current.processed_at) && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Processing</div>
              <div className={styles.fieldGrid}>
                {current.processed_by && (
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Processed By</span>
                    <span className={styles.fieldVal}>{current.processed_by}</span>
                  </div>
                )}
                {current.processed_at && (
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Processed At</span>
                    <span className={styles.fieldVal}>{fmtDate(current.processed_at)}</span>
                  </div>
                )}
                {current.admin_memo && (
                  <div className={`${styles.field} ${styles.fieldWide}`}>
                    <span className={styles.fieldLabel}>Admin Memo</span>
                    <div className={styles.memoBox}>{current.admin_memo}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Admin memo ─────────────────────────────────── */}
          <div className={styles.adminMemoWrap}>
            <label className={styles.adminMemoLabel}>Admin Memo</label>
            <textarea
              className={styles.adminMemoInput}
              placeholder="처리 메모를 입력하세요…"
              value={adminMemo}
              onChange={e => setAdminMemo(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className={styles.btnEmail}
                onClick={saveAdminMemo}
                disabled={saving}
                style={{ height: 30, fontSize: 12 }}
              >
                Save Memo
              </button>
              {saveMsg && (
                <span className={styles.savingRow}>
                  {saveMsg.startsWith('Error') ? '⚠ ' : '✓ '}{saveMsg}
                </span>
              )}
            </div>
          </div>

          {/* ── Status progress ────────────────────────────── */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Status Flow</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {STATUS_ORDER.map((s, i) => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className={`${styles.badge} ${badgeClass(s, styles)}`}
                    style={{ opacity: current.status === s ? 1 : 0.35 }}
                  >
                    {statusLabel(s)}
                  </span>
                  {i < STATUS_ORDER.length - 1 && (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
                  )}
                </span>
              ))}
            </div>
          </div>

        </div>

        {/* ── Footer actions ──────────────────────────────── */}
        <div className={styles.modalActions}>
          {/* SHIPHEYO sync indicator */}
          <div className={styles.syncRow} style={{ width: 'auto', marginRight: 'auto' }}>
            <span className={`${styles.syncDot} ${current.shipheyo_synced ? styles.syncDotOk : ''}`} />
            <span>{current.shipheyo_synced ? `Synced ${fmtDate(current.shipheyo_synced_at)}` : 'Not synced to SHIPHEYO'}</span>
            <button className={styles.btnSync} disabled title="SHIPHEYO API coming soon">
              → Sync
            </button>
          </div>

          <button className={styles.btnEmail} onClick={sendEmail} disabled={saving || current.email_sent}>
            {current.email_sent ? `✉ Sent ${fmtDate(current.email_sent_at)}` : '✉ Send Email'}
          </button>

          <button className={styles.btnReject}   onClick={() => setStatus('rejected')}  disabled={saving || !canReject}>✗ Reject</button>
          <button className={styles.btnApprove}  onClick={() => setStatus('approved')}  disabled={saving || !canApprove}>✓ Approve</button>
          <button className={styles.btnComplete} onClick={() => setStatus('completed')} disabled={saving || !canComplete}>✓ Complete</button>
        </div>

      </div>
    </div>
  )
}
