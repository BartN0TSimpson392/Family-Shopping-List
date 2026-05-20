import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: 'noindex, nofollow',
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children
}
