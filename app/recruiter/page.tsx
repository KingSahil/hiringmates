import { AppShell } from '@/components/AppShell'

export const metadata = {
  title: 'Recruiter & Mentor Portal | HiringMates',
  description: 'Review Round 1 verified candidates, evaluate AI confidence scores, and schedule Round 2 mentorship interviews.',
}

export default function RecruiterPage() {
  return <AppShell initialTab="recruiter" />
}
