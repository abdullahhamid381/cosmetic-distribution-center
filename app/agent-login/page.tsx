import {SignInPage} from '@/components/SignInPage';

export const dynamic = 'force-dynamic';

export default async function AgentLogin({searchParams}: {searchParams: Promise<{error?: string}>}) {
  const {error} = await searchParams;
  return <SignInPage agent error={error}/>;
}
