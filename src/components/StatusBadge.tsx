import type { RequestStatus } from "@/lib/types";

const LABELS: Record<RequestStatus, string> = {
  pending: "بانتظار الشراء",
  purchased: "تم إحضاره",
  cancelled: "ملغي",
};

const CLASSES: Record<RequestStatus, string> = {
  pending: "badge-pending",
  purchased: "badge-purchased",
  cancelled: "badge-cancelled",
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge ${CLASSES[status]}`}>{LABELS[status]}</span>;
}
