import '@fontsource/noto-nastaliq-urdu/700.css';

export function InvoicePaymentNotice({dueDate}: {dueDate: string}) {
  return <aside className="invoice-payment-notice" aria-label="Payment reminder">
    <strong>Please clear the outstanding balance by {dueDate}.</strong>
    <strong className="invoice-payment-notice-urdu" lang="ur" dir="rtl">براہ کرم بقایا رقم <bdi dir="ltr">{dueDate}</bdi> تک ادا کریں۔</strong>
  </aside>;
}
