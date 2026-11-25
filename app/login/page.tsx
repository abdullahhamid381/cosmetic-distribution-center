import {SignInPage} from '@/components/SignInPage';

export const dynamic = 'force-dynamic';

export default async function Login({searchParams}: {searchParams: Promise<{error?: string}>}) {
  const {error} = await searchParams;
  return <SignInPage error={error}/>;
}
