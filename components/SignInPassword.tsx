'use client';

import {useState} from 'react';
import {Eye, EyeOff} from 'lucide-react';
import styles from './sign-in.module.css';

export function SignInPassword() {
  const [visible, setVisible] = useState(false);
  const action = visible ? 'Hide password' : 'Show password';
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className={styles.passwordField}>
      <label htmlFor="sign-in-password">Password</label>
      <div className={styles.passwordInput}>
        <input id="sign-in-password" type={visible ? 'text' : 'password'} name="password"
          required autoComplete="current-password" autoCapitalize="none" spellCheck={false} placeholder="Enter your password"/>
        <button className={styles.passwordToggle} type="button" aria-label={action} title={action} aria-controls="sign-in-password"
          onClick={() => setVisible(current => !current)}>
          <Icon size={17} aria-hidden="true"/>
        </button>
      </div>
    </div>
  );
}
