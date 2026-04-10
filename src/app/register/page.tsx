import { redirect } from 'next/navigation'

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: {
    ref?: string
  }
}) {
  const ref = String(searchParams?.ref || '').trim()
  redirect(ref ? `/customer/register?ref=${encodeURIComponent(ref)}` : '/customer/register')
}
