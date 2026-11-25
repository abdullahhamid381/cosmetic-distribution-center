import Link from 'next/link';
import {ArrowRight, Smartphone} from 'lucide-react';
import {login} from '@/app/actions';
import {SignInCarousel} from './SignInCarousel';
import {SignInPassword} from './SignInPassword';
import styles from './sign-in.module.css';

export function SignInPage({agent = false, error}: {agent?: boolean; error?: string}) {
  const errorMessage = error === 'unavailable'
    ? 'The sign-in service is temporarily unavailable. Please try again shortly.'
    : agent && error === 'disabled'
      ? 'Your portal access is not enabled. Contact your administrator.'
      : agent
        ? 'Unable to sign in. Check your email, password and portal access.'
        : 'Invalid email or password. Please try again.';

  return (
    <main className={styles.page}>
      <section className={styles.formArea} aria-labelledby="sign-in-title">
        <div className={styles.formContent}>
          <div className={styles.wordmark}>
            <img src="/hh-medics-app-192.png" width={43} height={43} alt=""/>
            <div><strong>HH MEDICS</strong><span>Distribution Center</span></div>
          </div>

          <div className={styles.formHeading}>
            <h1 id="sign-in-title">{agent ? 'Sales agent sign-in' : 'Welcome back'}</h1>
            <p>{agent ? 'Sign in with the account assigned by your administrator.' : 'Sign in to your distribution workspace.'}</p>
          </div>

          <form className={styles.form} action={login}>
            {agent && <input type="hidden" name="portal_login" value="agent"/>}
            {error && <p className={styles.error} role="alert">{errorMessage}</p>}
            <label htmlFor="sign-in-email">Email address
              <input id="sign-in-email" type="email" name="email" required autoComplete="username" autoCapitalize="none" placeholder="name@company.com"/>
            </label>
            <SignInPassword/>
            <button className={styles.submit} type="submit">Sign in <ArrowRight size={17} aria-hidden="true"/></button>
          </form>

          <div className={styles.links}>
            <Link href={agent ? '/login' : '/agent-login'}>{agent ? 'Staff sign-in' : 'Sales agent sign-in'}</Link>
            <Link href="/install"><Smartphone size={15} aria-hidden="true"/> Install mobile app</Link>
          </div>
        </div>
      </section>
      <SignInCarousel agent={agent}/>
    </main>
  );
}
