import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(date);
}
