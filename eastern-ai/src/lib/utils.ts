import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInDays, differenceInHours, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDaysLeft(expiresAt: string): number {
  return Math.max(0, differenceInDays(new Date(expiresAt), new Date()))
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hoursAgo = differenceInHours(new Date(), date)
  if (hoursAgo < 1) return 'Just now'
  if (hoursAgo < 24) return `${hoursAgo}h ago`
  return format(date, 'MMM d, h:mm a')
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  return phone
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}
