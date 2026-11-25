import Link from 'next/link';
import {ArrowRight, Smartphone} from 'lucide-react';

export default function InstallApp() {
  return (
    <main className="login-page install-page">
      <div className="login-form-wrap">
        <section className="login-card">
          <Smartphone size={25} aria-hidden="true"/>
          <h1>Install HH MEDICS</h1>
          <p>Open this page on your phone to add the distribution workspace to your home screen.</p>
          <dl>
            <dt>iPhone or iPad</dt>
            <dd>In Safari, tap Share, then Add to Home Screen. If offered, turn on Open as Web App and tap Add.</dd>
            <dt>Android</dt>
            <dd>In Chrome, open the menu, then tap Install app or Add to Home screen.</dd>
          </dl>
          <p>Use your existing account. The app uses the same records as the web portal and requires an internet connection.</p>
          <Link href="/" className="btn primary">Open workspace <ArrowRight size={16} aria-hidden="true"/></Link>
        </section>
      </div>
    </main>
  );
}
